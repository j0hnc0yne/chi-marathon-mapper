const PACE_PATTERN = /^(\d{1,2}):([0-5]\d)$/;
const TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const MIN_PACE_MINUTES = 4.5; // 4:30 — just below the marathon world record
const MAX_PACE_MINUTES = 15; // 15:00 — just above the slowest course-closure pace

// @spec INPUT-003, INPUT-004
export function parsePaceInput(raw) {
  const match = PACE_PATTERN.exec(raw ?? "");
  if (!match) {
    return { error: "Enter pace as MM:SS per mile, e.g. 9:30" };
  }
  const minutesPerMile = Number(match[1]) + Number(match[2]) / 60;
  if (minutesPerMile < MIN_PACE_MINUTES || minutesPerMile > MAX_PACE_MINUTES) {
    return { error: "Pace must be between 4:30 and 15:00 per mile" };
  }
  return { minutesPerMile };
}

// @spec INPUT-001, INPUT-002
export function parseStartTimeInput(raw, raceDate) {
  const match = TIME_PATTERN.exec(raw ?? "");
  if (!match) {
    return { error: "Enter the runner's start time as HH:MM" };
  }
  const hhmm = `${match[1].padStart(2, "0")}:${match[2]}`;
  // The race happens on one fixed date in Chicago; combining the entered
  // clock time with the race date's fixed UTC offset interprets it as
  // Chicago local time no matter what timezone the spectator's device is in.
  return { date: new Date(`${raceDate.isoDate}T${hhmm}:00${raceDate.utcOffset}`) };
}

// @spec INPUT-001, INPUT-003
export function mountForm(container, { onChange }) {
  const startLabel = document.createElement("label");
  startLabel.textContent = "Runner's start time ";
  const startInput = document.createElement("input");
  startInput.type = "time";
  startInput.name = "start";
  startLabel.appendChild(startInput);

  const paceLabel = document.createElement("label");
  paceLabel.textContent = "Pace per mile (MM:SS) ";
  const paceInput = document.createElement("input");
  paceInput.type = "text";
  paceInput.name = "pace";
  paceInput.placeholder = "9:30";
  paceLabel.appendChild(paceInput);

  const errorEl = document.createElement("p");
  errorEl.className = "input-error";

  container.append(startLabel, paceLabel, errorEl);

  const emitChange = () => onChange({ startRaw: startInput.value, paceRaw: paceInput.value });
  startInput.addEventListener("input", emitChange);
  paceInput.addEventListener("input", emitChange);

  return { startInput, paceInput, errorEl };
}

// @spec INPUT-005, INPUT-006, INPUT-007
export function readInitialStateFromParams(params, raceDate) {
  const startParam = params.get("start");
  const paceParam = params.get("pace");

  if (startParam === null && paceParam === null) {
    return { status: "empty" };
  }

  const start = startParam !== null ? parseStartTimeInput(startParam, raceDate) : { error: "missing start time" };
  const pace = paceParam !== null ? parsePaceInput(paceParam) : { error: "missing pace" };

  if (start.error || pace.error) {
    return {
      status: "error",
      message: "This link is incomplete or malformed — enter the start time and pace to build a plan",
    };
  }

  return {
    status: "valid",
    raceStart: start.date,
    paceMinutesPerMile: pace.minutesPerMile,
    startRaw: startParam,
    paceRaw: paceParam,
  };
}

// @spec INPUT-008, INPUT-009, INPUT-010
export function nextFieldParam(lastValidValue, currentRaw, isValid) {
  if (currentRaw === "") return undefined;
  if (isValid(currentRaw)) return currentRaw;
  return lastValidValue;
}

// @spec INPUT-008, INPUT-009, INPUT-010, INPUT-011
export function syncFormToUrl({ startRaw, paceRaw }, raceDate, { replaceState, getSearch }) {
  const current = new URLSearchParams(getSearch());

  const nextStart = nextFieldParam(
    current.get("start") ?? undefined,
    startRaw,
    (v) => parseStartTimeInput(v, raceDate).error === undefined,
  );
  const nextPace = nextFieldParam(
    current.get("pace") ?? undefined,
    paceRaw,
    (v) => parsePaceInput(v).error === undefined,
  );

  const next = new URLSearchParams();
  if (nextStart !== undefined) next.set("start", nextStart);
  if (nextPace !== undefined) next.set("pace", nextPace);

  if (next.toString() === current.toString()) return;

  const query = next.toString();
  const url = query ? `?${query}` : typeof location !== "undefined" ? location.pathname : "?";
  replaceState(null, "", url);
}

// @spec INPUT-012
export function triggerPipeline(
  { raceStart, paceMinutesPerMile },
  { courseData, predictTimes, suggestItinerary, renderMap, minSlackMinutes },
) {
  const mileMarkerTimes = predictTimes(raceStart, paceMinutesPerMile, courseData.mileMarkers);
  const spotTimes = predictTimes(raceStart, paceMinutesPerMile, courseData.viewingSpots);
  const itinerary = suggestItinerary(spotTimes, (from, to) => courseData.getTravelTime(from, to), {
    minSlackMinutes,
  });
  renderMap({ mileMarkerTimes, itinerary });
  return { mileMarkerTimes, itinerary };
}
