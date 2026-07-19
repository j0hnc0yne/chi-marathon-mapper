import { describe, expect, it } from "vitest";
import { CourseDataError, getTravelTime, loadCourseData, resolveNearestMile } from "./course-data.js";
import { makeFullCourseMileMarkers, sparseMileMarkers, travelTimeMatrix, viewingSpots } from "./test-fixtures.js";

describe("loadCourseData", () => {
  // @spec COURSE-001
  it("normalizes a valid mile marker list of distance + coordinate pairs", () => {
    const mileMarkers = makeFullCourseMileMarkers();
    const data = loadCourseData({ mileMarkers, viewingSpots, travelTimeMatrix });
    expect(data.mileMarkers).toHaveLength(mileMarkers.length);
    expect(data.mileMarkers[0]).toMatchObject({ mile: 0, lat: expect.any(Number), lng: expect.any(Number) });
  });

  // @spec COURSE-002
  it("rejects a mile marker list that doesn't cover every full mile 0-26 plus the finish", () => {
    expect(() =>
      loadCourseData({ mileMarkers: sparseMileMarkers, viewingSpots, travelTimeMatrix }),
    ).toThrow(CourseDataError);
  });

  // @spec COURSE-003, COURSE-007
  it("rejects a viewing spot missing a required field", () => {
    const brokenSpots = [{ id: "spot-x", name: "No coordinates" }];
    expect(() =>
      loadCourseData({ mileMarkers: makeFullCourseMileMarkers(), viewingSpots: brokenSpots, travelTimeMatrix: [] }),
    ).toThrow(CourseDataError);
  });

  // @spec COURSE-007
  it("rejects course data that fails basic structural validation", () => {
    expect(() => loadCourseData({ mileMarkers: null, viewingSpots: [], travelTimeMatrix: [] })).toThrow(
      CourseDataError,
    );
  });

  // @spec COURSE-008
  it("rejects mile markers with a duplicate mile value", () => {
    const duplicated = [...makeFullCourseMileMarkers(), { mile: 26, lat: 41.9, lng: -87.6 }];
    expect(() =>
      loadCourseData({ mileMarkers: duplicated, viewingSpots, travelTimeMatrix }),
    ).toThrow(CourseDataError);
  });

  // @spec COURSE-008
  it("rejects mile markers that are not strictly increasing by mile", () => {
    const outOfOrder = makeFullCourseMileMarkers();
    [outOfOrder[2], outOfOrder[3]] = [outOfOrder[3], outOfOrder[2]];
    expect(() => loadCourseData({ mileMarkers: outOfOrder, viewingSpots, travelTimeMatrix })).toThrow(
      CourseDataError,
    );
  });

  // @spec COURSE-004, COURSE-010
  it("rejects a travel-time matrix missing an entry for a declared pair", () => {
    const incompleteMatrix = travelTimeMatrix.filter(
      (entry) => !(entry.from === "spot-mile3" && entry.to === "spot-mile7"),
    );
    expect(() =>
      loadCourseData({ mileMarkers: makeFullCourseMileMarkers(), viewingSpots, travelTimeMatrix: incompleteMatrix }),
    ).toThrow(CourseDataError);
  });

  // @spec COURSE-009
  it("flags a viewing spot as approximated when it snaps to a nearby mile marker", () => {
    const spotsWithGap = [{ ...viewingSpots[0], nearestMile: 3.4 }];
    const data = loadCourseData({
      mileMarkers: makeFullCourseMileMarkers(),
      viewingSpots: spotsWithGap,
      travelTimeMatrix: [],
    });
    expect(data.viewingSpots[0]).toMatchObject({ resolvedMile: 3, approximatedMile: true });
  });

  // @spec COURSE-009
  it("does not flag a viewing spot as approximated when its nearest mile exactly matches a marker", () => {
    const data = loadCourseData({
      mileMarkers: makeFullCourseMileMarkers(),
      viewingSpots: [viewingSpots[0]],
      travelTimeMatrix: [],
    });
    expect(data.viewingSpots[0]).toMatchObject({ resolvedMile: 3, approximatedMile: false });
  });
});

describe("resolveNearestMile", () => {
  // @spec COURSE-009
  it("snaps to the closest available mile marker by distance", () => {
    const mileMarkers = makeFullCourseMileMarkers();
    expect(resolveNearestMile(7.6, mileMarkers)).toEqual({ mile: 8, approximated: true });
    expect(resolveNearestMile(7.4, mileMarkers)).toEqual({ mile: 7, approximated: true });
  });
});

describe("getTravelTime", () => {
  // @spec COURSE-004
  it("stores independent, potentially asymmetric entries for each direction of a pair", () => {
    const aToB = getTravelTime(travelTimeMatrix, "spot-mile3", "spot-mile7", "transit");
    const bToA = getTravelTime(travelTimeMatrix, "spot-mile7", "spot-mile3", "transit");
    expect(aToB).toBe(14);
    expect(bToA).toBe(16);
  });

  // @spec COURSE-005
  it("returns both a walking and a transit estimate for a pair", () => {
    expect(getTravelTime(travelTimeMatrix, "spot-mile3", "spot-mile7", "walk")).toBe(42);
    expect(getTravelTime(travelTimeMatrix, "spot-mile3", "spot-mile7", "transit")).toBe(14);
  });

  // @spec COURSE-006
  it("does not support a driving mode", () => {
    expect(() => getTravelTime(travelTimeMatrix, "spot-mile3", "spot-mile7", "drive")).toThrow();
  });
});
