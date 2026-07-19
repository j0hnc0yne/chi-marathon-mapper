const DEFAULT_MIN_SLACK_MINUTES = 5;

function fasterTravelMinutes(entry) {
  const modes = [entry.walkMinutes, entry.transitMinutes].filter((m) => typeof m === "number");
  if (modes.length === 0) return undefined;
  return Math.min(...modes);
}

// @spec ITIN-001, ITIN-002, ITIN-003, ITIN-004, ITIN-005, ITIN-006, ITIN-007, ITIN-008, ITIN-009
export function suggestItinerary(spots, getTravelEntry, { minSlackMinutes = DEFAULT_MIN_SLACK_MINUTES } = {}) {
  const ordered = [...spots].sort(
    (a, b) => a.nearestMile - b.nearestMile || a.name.localeCompare(b.name),
  );

  const stops = [];
  if (ordered.length > 0) {
    // The first spot in course order is the anchor: reaching it is pre-race
    // positioning, not a travel-time constraint, so it gets no feasibility check.
    stops.push({
      spot: ordered[0],
      predictedTime: ordered[0].predictedTime,
      travelTimeFromPrevious: null,
      arrivalSlack: null,
      sequence: 1,
    });
  }

  let last = ordered[0];
  for (let i = 1; i < ordered.length; i += 1) {
    const candidate = ordered[i];
    const entry = getTravelEntry(last.id, candidate.id);
    if (!entry) continue;
    const travelMinutes = fasterTravelMinutes(entry);
    if (travelMinutes === undefined) continue;
    const arrivalSlack =
      (candidate.predictedTime.getTime() - last.predictedTime.getTime()) / 60_000 - travelMinutes;
    if (arrivalSlack >= minSlackMinutes) {
      stops.push({
        spot: candidate,
        predictedTime: candidate.predictedTime,
        travelTimeFromPrevious: travelMinutes,
        arrivalSlack,
        sequence: stops.length + 1,
      });
      last = candidate;
    }
  }

  return { stops, sparse: stops.length <= 1 };
}
