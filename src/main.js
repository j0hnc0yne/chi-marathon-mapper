import { CourseDataError, loadCourseData } from "./course-data.js";
import { predictTimes } from "./pace-predictor.js";
import { suggestItinerary } from "./itinerary-suggester.js";
import {
  mountForm,
  parsePaceInput,
  parseStartTimeInput,
  readInitialStateFromParams,
  syncFormToUrl,
  triggerPipeline,
} from "./input-state.js";
import {
  MapsLoadError,
  buildMapsScriptUrl,
  loadMapsApi,
  renderPlan,
  resolveClickPriority,
} from "./map-display.js";
import { MAP_CENTER, MAP_ZOOM, MAPS_API_KEY, RACE_DATE } from "./config.js";

// Two markers within ~30 m of each other are treated as a single click target
// for priority resolution (MAP-009).
const OVERLAP_EPSILON_DEG = 0.0003;

function injectMapsScript() {
  return new Promise((resolve, reject) => {
    if (!MAPS_API_KEY) {
      reject(new Error("No Google Maps API key configured — set MAPS_API_KEY in src/config.js"));
      return;
    }
    const script = document.createElement("script");
    script.src = buildMapsScriptUrl(MAPS_API_KEY);
    script.async = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => reject(new Error("Google Maps script failed to load"));
    document.head.appendChild(script);
  });
}

async function fetchCourseData() {
  const response = await fetch("./data/course-data.json");
  if (!response.ok) {
    throw new CourseDataError(`Course data could not be fetched (HTTP ${response.status})`);
  }
  return loadCourseData(await response.json());
}

// @spec MAP-008, MAP-009
function wireClickPriority(mapsApi, map, markerRecords) {
  for (const record of markerRecords) {
    mapsApi.event?.clearInstanceListeners?.(record.marker);
    record.marker.addListener("click", () => {
      const overlapping = markerRecords.filter(
        (other) =>
          Math.abs(other.lat - record.lat) < OVERLAP_EPSILON_DEG &&
          Math.abs(other.lng - record.lng) < OVERLAP_EPSILON_DEG,
      );
      const winner = resolveClickPriority(overlapping);
      winner.infoWindow.open({ map, anchor: winner.marker });
    });
  }
}

async function init() {
  const formEl = document.getElementById("inputs");
  const messagesEl = document.getElementById("messages");
  const mapEl = document.getElementById("map");

  let rendered = { route: null, markerRecords: [] };
  let mapsApi = null;
  let map = null;
  let courseData = null;

  const clearRendered = () => {
    rendered.route?.setMap?.(null);
    for (const record of rendered.markerRecords) record.marker.setMap?.(null);
    rendered = { route: null, markerRecords: [] };
  };

  const render = (state) => {
    clearRendered();
    rendered = renderPlan(map, mapsApi, messagesEl, state);
    if (mapsApi && rendered.markerRecords.length > 0) {
      wireClickPriority(mapsApi, map, rendered.markerRecords);
    }
  };

  // Load the two hard dependencies up front; each failure has its own
  // explicit error state (MAP-010, MAP-012).
  try {
    courseData = await fetchCourseData();
  } catch (error) {
    renderPlan(null, null, messagesEl, {
      courseError: error instanceof CourseDataError ? error.message : "Course data is unavailable.",
    });
    return;
  }

  try {
    mapsApi = await loadMapsApi(injectMapsScript);
  } catch (error) {
    renderPlan(null, null, messagesEl, {
      mapsError: error instanceof MapsLoadError ? "Google Maps failed to load — try reloading the page." : String(error),
    });
    return;
  }

  map = new mapsApi.Map(mapEl, { center: MAP_CENTER, zoom: MAP_ZOOM, mapTypeControl: false, streetViewControl: false });

  const runPipeline = (state) => {
    triggerPipeline(state, {
      courseData,
      predictTimes,
      suggestItinerary,
      renderMap: ({ mileMarkerTimes, itinerary }) =>
        render({ courseMileMarkers: courseData.mileMarkers, mileMarkerTimes, itinerary }),
    });
  };

  const renderBareRoute = () =>
    render({ courseMileMarkers: courseData.mileMarkers, mileMarkerTimes: null, itinerary: null });

  const { startInput, paceInput, errorEl } = mountForm(formEl, {
    onChange: ({ startRaw, paceRaw }) => {
      syncFormToUrl({ startRaw, paceRaw }, RACE_DATE, {
        replaceState: history.replaceState.bind(history),
        getSearch: () => location.search,
      });

      const start = parseStartTimeInput(startRaw, RACE_DATE);
      const pace = parsePaceInput(paceRaw);
      const bothEntered = startRaw !== "" && paceRaw !== "";

      if (start.error === undefined && pace.error === undefined) {
        errorEl.textContent = "";
        runPipeline({ raceStart: start.date, paceMinutesPerMile: pace.minutesPerMile });
      } else {
        // Only surface validation errors once both fields have content, so a
        // half-typed pace doesn't flash an error mid-keystroke (INPUT-004).
        errorEl.textContent = bothEntered ? (start.error ?? pace.error ?? "") : "";
        renderBareRoute();
      }
    },
  });

  // @spec INPUT-005, INPUT-006, INPUT-007
  const initial = readInitialStateFromParams(new URLSearchParams(location.search), RACE_DATE);
  if (initial.status === "valid") {
    startInput.value = initial.startRaw;
    paceInput.value = initial.paceRaw;
    runPipeline(initial);
  } else if (initial.status === "error") {
    errorEl.textContent = initial.message;
    renderBareRoute();
  } else {
    renderBareRoute();
  }
}

init();
