import { describe, expect, it } from "vitest";
import { predictTimes } from "./pace-predictor.js";

const RACE_START = new Date("2025-10-12T07:30:00-05:00");

describe("predictTimes", () => {
  // @spec PACE-001, PACE-005
  it("computes predicted clock time as start plus distance times pace, using raceStart as given", () => {
    const [result] = predictTimes(RACE_START, 9.5, [{ mile: 3 }]);
    const expected = new Date(RACE_START.getTime() + 3 * 9.5 * 60_000);
    expect(result.predictedTime.getTime()).toBe(expected.getTime());
  });

  // @spec PACE-002
  it("applies the same constant pace across every point rather than varying by segment", () => {
    const [three, seven] = predictTimes(RACE_START, 10, [{ mile: 3 }, { mile: 7 }]);
    const minutesBetween = (seven.predictedTime.getTime() - three.predictedTime.getTime()) / 60_000;
    expect(minutesBetween).toBeCloseTo(4 * 10, 5);
  });

  // @spec PACE-003
  it("reads distance from nearestMile for viewing spots and from mile for course markers", () => {
    const [marker, spot] = predictTimes(RACE_START, 9, [{ mile: 5 }, { nearestMile: 5 }]);
    expect(marker.predictedTime.getTime()).toBe(spot.predictedTime.getTime());
  });

  // @spec PACE-004
  it("does not derive or default its own race date, only uses the date on the given raceStart", () => {
    const otherDayStart = new Date("2026-04-19T08:00:00-05:00");
    const [result] = predictTimes(otherDayStart, 9, [{ mile: 1 }]);
    expect(result.predictedTime.getUTCFullYear()).toBe(2026);
    expect(result.predictedTime.getUTCMonth()).toBe(3); // April
    expect(result.predictedTime.getUTCDate()).toBe(19);
  });

  // @spec PACE-006
  it("does not validate the pace value, computing a result even for an out-of-range pace", () => {
    expect(() => predictTimes(RACE_START, -5, [{ mile: 3 }])).not.toThrow();
    expect(() => predictTimes(RACE_START, 0, [{ mile: 3 }])).not.toThrow();
  });

  // @spec PACE-007
  it("treats an empty point list as an error", () => {
    expect(() => predictTimes(RACE_START, 9, [])).toThrow();
  });

  // @spec PACE-008
  it("computes a predicted time for a point beyond 26.2 miles without clamping", () => {
    const [result] = predictTimes(RACE_START, 9, [{ mile: 30 }]);
    const expected = new Date(RACE_START.getTime() + 30 * 9 * 60_000);
    expect(result.predictedTime.getTime()).toBe(expected.getTime());
  });
});
