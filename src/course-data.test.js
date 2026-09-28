import { describe, expect, it } from "vitest";
import { CourseDataError, courseDataUrl, getTravelTime, loadCourseData, resolveNearestMile } from "./course-data.js";
import {
  makeFullCourseMileMarkers,
  makeRouteGeometry,
  sparseMileMarkers,
  travelTimeMatrix,
  viewingSpots,
} from "./test-fixtures.js";

describe("loadCourseData", () => {
  // @spec COURSE-001
  it("normalizes a valid mile marker list of distance + coordinate pairs", () => {
    const mileMarkers = makeFullCourseMileMarkers();
    const data = loadCourseData({ routeGeometry: makeRouteGeometry(), mileMarkers, viewingSpots, travelTimeMatrix });
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
      routeGeometry: makeRouteGeometry(),
      mileMarkers: makeFullCourseMileMarkers(),
      viewingSpots: spotsWithGap,
      travelTimeMatrix: [],
    });
    expect(data.viewingSpots[0]).toMatchObject({ resolvedMile: 3, approximatedMile: true });
  });

  // @spec COURSE-009
  it("does not flag a viewing spot as approximated when its nearest mile exactly matches a marker", () => {
    const data = loadCourseData({
      routeGeometry: makeRouteGeometry(),
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

describe("route geometry", () => {
  const valid = () => ({
    routeGeometry: makeRouteGeometry(),
    mileMarkers: makeFullCourseMileMarkers(),
    viewingSpots,
    travelTimeMatrix,
  });

  // @spec COURSE-011
  it("passes route geometry through as an ordered list of coordinates", () => {
    const data = loadCourseData(valid());
    expect(data.routeGeometry.length).toBeGreaterThan(makeFullCourseMileMarkers().length);
    expect(data.routeGeometry[0]).toMatchObject({ lat: expect.any(Number), lng: expect.any(Number) });
  });

  // @spec COURSE-014
  it("rejects course data with no route geometry at all", () => {
    const { routeGeometry, ...withoutGeometry } = valid();
    expect(() => loadCourseData(withoutGeometry)).toThrow(CourseDataError);
  });

  // @spec COURSE-014
  it("rejects route geometry that is not a list", () => {
    expect(() => loadCourseData({ ...valid(), routeGeometry: { lat: 41.8, lng: -87.6 } })).toThrow(CourseDataError);
  });

  // @spec COURSE-014
  it("rejects route geometry holding fewer than two points, which cannot describe a route", () => {
    expect(() => loadCourseData({ ...valid(), routeGeometry: [{ lat: 41.8, lng: -87.6 }] })).toThrow(CourseDataError);
  });

  // @spec COURSE-014
  it("rejects a route geometry point whose coordinate is not a finite number", () => {
    const geometry = makeRouteGeometry();
    geometry[3] = { lat: 41.8, lng: Number.NaN };
    expect(() => loadCourseData({ ...valid(), routeGeometry: geometry })).toThrow(CourseDataError);
  });

  // @spec COURSE-026
  it("loads course data that carries no provenance entry, which is documentation rather than a required field", () => {
    expect(() => loadCourseData(valid())).not.toThrow();
    expect(() => loadCourseData({ ...valid(), _provenance: undefined })).not.toThrow();
  });
});

describe("courseDataUrl", () => {
  // @spec COURSE-032
  it("carries the data's version, so a cache holding an earlier version cannot answer", () => {
    const before = courseDataUrl("a1b2c3");
    const after = courseDataUrl("d4e5f6");
    expect(before).toContain("a1b2c3");
    expect(before).not.toEqual(after);
  });

  // @spec COURSE-032
  it("still points at the course data file", () => {
    expect(courseDataUrl("a1b2c3").split("?")[0]).toBe("./data/course-data.json");
  });
});

describe("the build's course-data version", () => {
  // @spec COURSE-032
  it("is derived from the committed data file's content", async () => {
    const { createHash } = await import("node:crypto");
    const { readFileSync } = await import("node:fs");
    const config = (await import("../vite.config.js")).default;
    const expected = createHash("sha256")
      .update(readFileSync(new URL("../public/data/course-data.json", import.meta.url)))
      .digest("hex")
      .slice(0, 12);
    expect(config.define.__COURSE_DATA_VERSION__).toBe(JSON.stringify(expected));
  });
});
