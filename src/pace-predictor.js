// @spec PACE-001, PACE-002, PACE-003, PACE-004, PACE-005, PACE-006, PACE-007, PACE-008
export function predictTimes(raceStart, paceMinutesPerMile, points) {
  if (!Array.isArray(points) || points.length === 0) {
    throw new Error("No course points to predict — course data did not load correctly");
  }
  return points.map((point) => {
    const mile = typeof point.mile === "number" ? point.mile : point.nearestMile;
    return {
      ...point,
      predictedTime: new Date(raceStart.getTime() + mile * paceMinutesPerMile * 60_000),
    };
  });
}
