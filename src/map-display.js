export class MapsLoadError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "MapsLoadError";
  }
}

// @spec MAP-011
export function buildMapsScriptUrl(apiKey) {
  return `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
}

// @spec MAP-010
export async function loadMapsApi(scriptLoader) {
  try {
    return await scriptLoader();
  } catch (cause) {
    throw new MapsLoadError("Google Maps failed to load", { cause });
  }
}

function formatChicagoTime(date) {
  return date.toLocaleTimeString("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const SUGGESTED_STOP_ICON = {
  path: "M 0,-2 L 1.8,1.5 L -1.8,1.5 Z",
  scale: 7,
  fillColor: "#d32f2f",
  fillOpacity: 1,
  strokeColor: "#ffffff",
  strokeWeight: 1.5,
};

// @spec MAP-001
export function renderRoute(map, mapsApi, mileMarkers) {
  return new mapsApi.Polyline({
    map,
    path: mileMarkers.map((m) => ({ lat: m.lat, lng: m.lng })),
    strokeColor: "#1a73e8",
    strokeWeight: 4,
  });
}

// @spec MAP-002, MAP-003
export function renderMileMarkers(map, mapsApi, points) {
  return points.map((point) => {
    const marker = new mapsApi.Marker({
      map,
      position: { lat: point.lat, lng: point.lng },
      title: `Mile ${point.mile}`,
    });
    const infoWindow = new mapsApi.InfoWindow({
      content: `<strong>Mile ${point.mile}</strong> — runner expected at ${formatChicagoTime(point.predictedTime)}`,
    });
    const record = { kind: "plain", marker, infoWindow, lat: point.lat, lng: point.lng };
    marker.addListener("click", () => infoWindow.open({ map, anchor: marker }));
    return record;
  });
}

// @spec MAP-004, MAP-005
export function renderSuggestedStops(map, mapsApi, stops) {
  return stops.map((stop) => {
    const marker = new mapsApi.Marker({
      map,
      position: { lat: stop.spot.lat, lng: stop.spot.lng },
      title: `Stop ${stop.sequence}: ${stop.spot.name}`,
      icon: SUGGESTED_STOP_ICON,
      zIndex: 100,
    });
    const lines = [
      `<strong>Stop ${stop.sequence}: ${stop.spot.name}</strong>`,
      `Runner expected at ${formatChicagoTime(stop.predictedTime)}`,
    ];
    if (typeof stop.arrivalSlack === "number") {
      lines.push(`Arrive about ${Math.round(stop.arrivalSlack)} min before the runner`);
    }
    if (stop.spot.approximatedMile) {
      lines.push("Time is approximate — this spot sits between mile markers");
    }
    const infoWindow = new mapsApi.InfoWindow({ content: lines.join("<br>") });
    const record = { kind: "suggested", marker, infoWindow, lat: stop.spot.lat, lng: stop.spot.lng };
    marker.addListener("click", () => infoWindow.open({ map, anchor: marker }));
    return record;
  });
}

// @spec MAP-009
export function resolveClickPriority(candidateRecords) {
  return candidateRecords.find((r) => r.kind === "suggested") ?? candidateRecords[0];
}

function showMessage(container, text, kind) {
  const el = document.createElement("p");
  el.className = `map-message map-message-${kind}`;
  el.textContent = text;
  container.appendChild(el);
}

// @spec MAP-006, MAP-007, MAP-010, MAP-012
export function renderPlan(map, mapsApi, messageContainer, state) {
  messageContainer.replaceChildren();

  if (state.mapsError) {
    showMessage(messageContainer, state.mapsError, "error");
    return { route: null, markerRecords: [] };
  }
  if (state.courseError) {
    showMessage(messageContainer, state.courseError, "error");
    return { route: null, markerRecords: [] };
  }

  const route = renderRoute(map, mapsApi, state.courseMileMarkers);
  const markerRecords = [];

  if (!state.mileMarkerTimes) {
    return { route, markerRecords };
  }

  markerRecords.push(...renderMileMarkers(map, mapsApi, state.mileMarkerTimes));

  if (state.itinerary) {
    markerRecords.push(...renderSuggestedStops(map, mapsApi, state.itinerary.stops));
    if (state.itinerary.sparse) {
      showMessage(
        messageContainer,
        "No feasible multi-stop plan was found for this pace — the runner outruns the travel time between viewing spots.",
        "warning",
      );
    }
  }

  return { route, markerRecords };
}
