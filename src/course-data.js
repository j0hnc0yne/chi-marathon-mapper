export class CourseDataError extends Error {
  constructor(message) {
    super(message);
    this.name = "CourseDataError";
  }
}

const TRAVEL_MODES = ["walk", "transit"];

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// @spec COURSE-009
export function resolveNearestMile(nearestMile, mileMarkers) {
  let closest = mileMarkers[0];
  for (const marker of mileMarkers) {
    if (Math.abs(marker.mile - nearestMile) < Math.abs(closest.mile - nearestMile)) {
      closest = marker;
    }
  }
  return { mile: closest.mile, approximated: closest.mile !== nearestMile };
}

// @spec COURSE-004, COURSE-005, COURSE-006
export function getTravelTime(travelTimeMatrix, fromId, toId, mode) {
  if (!TRAVEL_MODES.includes(mode)) {
    throw new CourseDataError(`Unsupported travel mode "${mode}" — only walking and transit are available`);
  }
  const entry = travelTimeMatrix.find((e) => e.from === fromId && e.to === toId);
  if (!entry) return undefined;
  return mode === "walk" ? entry.walkMinutes : entry.transitMinutes;
}

function validateMileMarkers(mileMarkers) {
  if (!Array.isArray(mileMarkers)) {
    throw new CourseDataError("Course data is invalid: mile markers are missing or not a list");
  }
  for (const marker of mileMarkers) {
    if (!isFiniteNumber(marker?.mile) || !isFiniteNumber(marker?.lat) || !isFiniteNumber(marker?.lng)) {
      throw new CourseDataError("Course data is invalid: a mile marker is missing mile, lat, or lng");
    }
  }
  for (let i = 1; i < mileMarkers.length; i += 1) {
    if (mileMarkers[i].mile <= mileMarkers[i - 1].mile) {
      throw new CourseDataError("Course data is invalid: mile markers must be strictly increasing with no duplicates");
    }
  }
  const miles = new Set(mileMarkers.map((m) => m.mile));
  for (let mile = 0; mile <= 26; mile += 1) {
    if (!miles.has(mile)) {
      throw new CourseDataError(`Course data is invalid: missing mile marker for mile ${mile}`);
    }
  }
  if (!miles.has(26.2)) {
    throw new CourseDataError("Course data is invalid: missing the finish marker at mile 26.2");
  }
}

function validateViewingSpots(viewingSpots) {
  if (!Array.isArray(viewingSpots)) {
    throw new CourseDataError("Course data is invalid: viewing spots are missing or not a list");
  }
  for (const spot of viewingSpots) {
    const valid =
      typeof spot?.id === "string" &&
      typeof spot?.name === "string" &&
      isFiniteNumber(spot?.lat) &&
      isFiniteNumber(spot?.lng) &&
      isFiniteNumber(spot?.nearestMile);
    if (!valid) {
      throw new CourseDataError("Course data is invalid: a viewing spot is missing a required field");
    }
  }
}

function validateTravelTimeMatrix(travelTimeMatrix, viewingSpots) {
  if (!Array.isArray(travelTimeMatrix)) {
    throw new CourseDataError("Course data is invalid: travel-time matrix is missing or not a list");
  }
  for (const entry of travelTimeMatrix) {
    if (typeof entry?.from !== "string" || typeof entry?.to !== "string" || !isFiniteNumber(entry?.walkMinutes)) {
      throw new CourseDataError("Course data is invalid: a travel-time entry is missing from, to, or walkMinutes");
    }
  }
  for (const from of viewingSpots) {
    for (const to of viewingSpots) {
      if (from.id === to.id) continue;
      const found = travelTimeMatrix.some((e) => e.from === from.id && e.to === to.id);
      if (!found) {
        throw new CourseDataError(
          `Course data is invalid: travel-time matrix has no entry from "${from.id}" to "${to.id}"`,
        );
      }
    }
  }
}

// @spec COURSE-001, COURSE-002, COURSE-003, COURSE-004, COURSE-007, COURSE-008, COURSE-009, COURSE-010
export function loadCourseData({ mileMarkers, viewingSpots, travelTimeMatrix }) {
  validateMileMarkers(mileMarkers);
  validateViewingSpots(viewingSpots);
  validateTravelTimeMatrix(travelTimeMatrix, viewingSpots);

  const resolvedSpots = viewingSpots.map((spot) => {
    const { mile, approximated } = resolveNearestMile(spot.nearestMile, mileMarkers);
    return { ...spot, resolvedMile: mile, approximatedMile: approximated };
  });

  return {
    mileMarkers,
    viewingSpots: resolvedSpots,
    travelTimeMatrix,
    // Pair-level lookup used by the itinerary pipeline: returns the raw entry
    // (both modes) or undefined, letting the suggester pick the faster mode.
    getTravelTime(fromId, toId) {
      return travelTimeMatrix.find((e) => e.from === fromId && e.to === toId);
    },
  };
}
