import { describe, expect, it } from "vitest";
import {
  ExtractionError,
  anchorSpot,
  buildCourseData,
  cumulativeMiles,
  emitMileMarkers,
  extractCourseData,
  findCoursePath,
  georeference,
  orientToCourse,
  makeTransform,
  matchPrintedMileLabels,
  pointAtMile,
  routeLengthMiles,
  solveOffset,
  solveScale,
  validateControlPoints,
  validateEndpoints,
  validateMileLabels,
} from "./extract-course-data.mjs";

const REFERENCE_LAT = 41.8721;
const DEG_LAT_PER_MILE = 1 / 69.0547;

// A synthetic course: a straight line due north, 26.2 miles long, drawn as a
// page path 2620 points tall (100 pt per mile). Distances along a meridian are
// exact, which keeps the arithmetic in these tests checkable by hand.
function straightPagePath(points = 2) {
  const path = [];
  for (let i = 0; i < points; i += 1) {
    path.push([300, (2620 * i) / (points - 1)]);
  }
  return path;
}

function straightGeometry(points = 2) {
  const geo = [];
  for (let i = 0; i < points; i += 1) {
    geo.push({ lat: 41.8 + ((26.2 * DEG_LAT_PER_MILE) * i) / (points - 1), lng: -87.6 });
  }
  return geo;
}

const COURSE_STYLE_PATH = {
  op: "S",
  stroke: ["SCN", [1]],
  lw: 2,
  sub: [straightPagePath(60)],
};
const DECOY_PATH = { op: "f", stroke: ["K", [0, 0, 0, 0.3]], lw: 0.75, sub: [straightPagePath(60)] };

describe("findCoursePath", () => {
  // @spec COURSE-017
  it("returns the single path drawn in the course's style", () => {
    const found = findCoursePath([DECOY_PATH, COURSE_STYLE_PATH, DECOY_PATH]);
    expect(found).toHaveLength(60);
  });

  // @spec COURSE-017
  it("aborts when no path matches the course's drawing style", () => {
    expect(() => findCoursePath([DECOY_PATH])).toThrow(ExtractionError);
  });

  // @spec COURSE-017
  it("aborts rather than guessing when more than one path matches the course's style", () => {
    expect(() => findCoursePath([COURSE_STYLE_PATH, { ...COURSE_STYLE_PATH }])).toThrow(ExtractionError);
  });
});

describe("routeLengthMiles", () => {
  // @spec COURSE-013
  it("sums great-circle distances between consecutive points", () => {
    expect(routeLengthMiles(straightGeometry(2))).toBeCloseTo(26.2, 3);
  });

  // @spec COURSE-013
  it("is unchanged by subdividing a straight run into more points", () => {
    expect(routeLengthMiles(straightGeometry(50))).toBeCloseTo(routeLengthMiles(straightGeometry(2)), 3);
  });
});

describe("solveScale", () => {
  // @spec COURSE-018
  it("solves the scale so the georeferenced route measures the certified race distance", () => {
    const scale = solveScale(straightPagePath(2), { targetMiles: 26.2, referenceLat: REFERENCE_LAT });
    const transform = makeTransform(scale, { latAtZero: 41.8, lngAtZero: -87.6 });
    expect(routeLengthMiles(georeference(straightPagePath(2), transform))).toBeCloseTo(26.2, 4);
  });

  // @spec COURSE-018
  it("treats the projection as conformal, so a degree of longitude covers less ground than a degree of latitude", () => {
    const scale = solveScale(straightPagePath(2), { targetMiles: 26.2, referenceLat: REFERENCE_LAT });
    const ratio = scale.degLngPerPoint / scale.degLatPerPoint;
    expect(ratio).toBeCloseTo(1 / Math.cos((REFERENCE_LAT * Math.PI) / 180), 3);
  });
});

describe("solveOffset", () => {
  // @spec COURSE-018
  it("places the map from street-label control points, averaging their offsets", () => {
    const scale = { degLatPerPoint: 0.0001, degLngPerPoint: 0.00013 };
    const offset = solveOffset(
      {
        eastWest: [
          { pageY: 100, lat: 41.86 },
          { pageY: 200, lat: 41.87 },
        ],
        northSouth: [
          { pageX: 100, lng: -87.65 },
          { pageX: 200, lng: -87.637 },
        ],
      },
      scale,
    );
    expect(offset.latAtZero).toBeCloseTo(41.85, 6);
    expect(offset.lngAtZero).toBeCloseTo(-87.663, 6);
  });
});

describe("emitMileMarkers", () => {
  const geo = straightGeometry(2);

  // @spec COURSE-019
  it("emits mile 0, every full mile through 26, and the finish at 26.2", () => {
    const miles = emitMileMarkers(geo).map((m) => m.mile);
    expect(miles).toEqual([...Array.from({ length: 27 }, (_, i) => i), 26.2]);
  });

  // @spec COURSE-019
  it("puts mile 0 at the start line and the finish marker at the last geometry point", () => {
    // Emitted coordinates are rounded to 5 decimals — about 3.6 ft, the
    // precision the shipped data file carries — so assert at that precision.
    const markers = emitMileMarkers(geo);
    expect(markers[0]).toMatchObject({ lat: expect.closeTo(geo[0].lat, 5), lng: expect.closeTo(geo[0].lng, 5) });
    const finish = markers[markers.length - 1];
    expect(finish.lat).toBeCloseTo(geo[geo.length - 1].lat, 5);
  });
});

describe("pointAtMile", () => {
  // @spec COURSE-020
  it("interpolates within the segment holding the distance rather than snapping to a vertex", () => {
    // Two vertices 26.2 miles apart: every marker between them must be interpolated.
    const geo = straightGeometry(2);
    const point = pointAtMile(geo, cumulativeMiles(geo), 13.1);
    const midLat = (geo[0].lat + geo[1].lat) / 2;
    expect(point.lat).toBeCloseTo(midLat, 6);
    expect(point.lat).not.toBeCloseTo(geo[0].lat, 4);
    expect(point.lat).not.toBeCloseTo(geo[1].lat, 4);
  });

  // @spec COURSE-020
  it("returns a point whose distance from the start is the distance asked for", () => {
    const geo = straightGeometry(2);
    const point = pointAtMile(geo, cumulativeMiles(geo), 7);
    expect(routeLengthMiles([geo[0], point])).toBeCloseTo(7, 3);
  });
});

describe("anchorSpot", () => {
  // A course that runs north 10 miles, then retraces south on a line ~250 ft to
  // the east — so a spot beside the northbound leg is passed twice.
  const outAndBack = [
    { lat: 41.8, lng: -87.6 },
    { lat: 41.8 + 10 * DEG_LAT_PER_MILE, lng: -87.6 },
    { lat: 41.8 + 10 * DEG_LAT_PER_MILE, lng: -87.59907 },
    { lat: 41.8, lng: -87.59907 },
  ];
  const cum = cumulativeMiles(outAndBack);

  // @spec COURSE-027
  it("anchors a spot to the earliest pass when the course passes it twice within sight", () => {
    const spot = { lat: 41.8 + 4 * DEG_LAT_PER_MILE, lng: -87.59953 };
    expect(anchorSpot(spot, outAndBack, cum)).toBeCloseTo(4, 1);
  });

  // @spec COURSE-027
  it("ignores a nearer-in-order pass that is further than 500 ft away", () => {
    // Beside the return leg, more than 500 ft east of the outbound leg.
    const farOut = [
      { lat: 41.8, lng: -87.6 },
      { lat: 41.8 + 10 * DEG_LAT_PER_MILE, lng: -87.6 },
      { lat: 41.8 + 10 * DEG_LAT_PER_MILE, lng: -87.594 },
      { lat: 41.8, lng: -87.594 },
    ];
    const spot = { lat: 41.8 + 4 * DEG_LAT_PER_MILE, lng: -87.594 };
    const anchored = anchorSpot(spot, farOut, cumulativeMiles(farOut));
    expect(anchored).toBeGreaterThan(10);
  });

  // @spec COURSE-028
  it("aborts when the course never passes within 500 ft of a curated spot", () => {
    const spot = { lat: 41.8 + 4 * DEG_LAT_PER_MILE, lng: -87.7 };
    expect(() => anchorSpot(spot, outAndBack, cum)).toThrow(ExtractionError);
  });
});

describe("validation gates", () => {
  const geo = straightGeometry(2);
  const cum = cumulativeMiles(geo);
  const printedLabels = Object.fromEntries(
    Array.from({ length: 26 }, (_, i) => [i + 1, pointAtMile(geo, cum, i + 1)]),
  );

  // @spec COURSE-021
  it("passes when every printed mile label sits near the computed position for that mile", () => {
    expect(() => validateMileLabels(geo, printedLabels)).not.toThrow();
  });

  // @spec COURSE-021
  it("aborts when a printed mile label is further than 2,000 ft from its computed position", () => {
    const moved = { ...printedLabels, 17: pointAtMile(geo, cum, 17.5) };
    expect(() => validateMileLabels(geo, moved)).toThrow(ExtractionError);
  });

  // @spec COURSE-021
  it("aborts on a geometry walked in the wrong direction, which throws every mile off by miles", () => {
    expect(() => validateMileLabels([...geo].reverse(), printedLabels)).toThrow(ExtractionError);
  });

  // @spec COURSE-021
  it("matches each printed number to the mile it labels by where it sits along the route", () => {
    const labelPoints = Object.entries(printedLabels).map(([mile, point]) => ({ value: Number(mile), ...point }));
    const matched = matchPrintedMileLabels(geo, labelPoints);
    expect(Object.keys(matched)).toHaveLength(26);
  });

  // @spec COURSE-021
  it("does not mistake a kilometre marker for the mile of the same number", () => {
    // The k'th kilometre marker sits at 0.621k miles, so a label at that
    // distance must not be read as mile k.
    const labelPoints = Object.entries(printedLabels).map(([mile, point]) => ({ value: Number(mile), ...point }));
    const kilometreLabels = [5, 10, 15, 20, 25].map((k) => ({
      value: k,
      ...pointAtMile(geo, cum, k * 0.621371),
    }));
    const matched = matchPrintedMileLabels(geo, [...kilometreLabels, ...labelPoints]);
    for (const k of [5, 10, 15, 20, 25]) {
      expect(matched[k]).toMatchObject({ lat: expect.closeTo(printedLabels[k].lat, 6) });
    }
  });

  // @spec COURSE-021
  it("aborts when no printed label can be matched to some mile, as a wrong fit would cause", () => {
    const labelPoints = Object.entries(printedLabels)
      .filter(([mile]) => Number(mile) !== 9)
      .map(([mile, point]) => ({ value: Number(mile), ...point }));
    expect(() => matchPrintedMileLabels(geo, labelPoints)).toThrow(ExtractionError);
  });

  // @spec COURSE-031
  it("reverses a path drawn from the finish backwards, so geometry comes out in course order", () => {
    const known = { start: geo[0], finish: geo[geo.length - 1] };
    const oriented = orientToCourse([...geo].reverse(), known);
    expect(oriented[0].lat).toBeCloseTo(geo[0].lat, 6);
    expect(oriented[oriented.length - 1].lat).toBeCloseTo(geo[geo.length - 1].lat, 6);
  });

  // @spec COURSE-031
  it("leaves a path already in course order alone", () => {
    const known = { start: geo[0], finish: geo[geo.length - 1] };
    expect(orientToCourse(geo, known)[0].lat).toBeCloseTo(geo[0].lat, 6);
  });

  // @spec COURSE-022
  it("aborts when the route's first point is not the known start line", () => {
    const known = { start: { lat: 41.9, lng: -87.6 }, finish: geo[geo.length - 1] };
    expect(() => validateEndpoints(geo, known)).toThrow(ExtractionError);
  });

  // @spec COURSE-022
  it("passes when both endpoints sit within 300 ft of their known locations", () => {
    const known = { start: geo[0], finish: geo[geo.length - 1] };
    expect(() => validateEndpoints(geo, known)).not.toThrow();
  });

  // @spec COURSE-023
  it("aborts when a street-label control point is fitted more than 1,000 ft from its known coordinate", () => {
    const transform = makeTransform(
      { degLatPerPoint: 0.0001, degLngPerPoint: 0.00013 },
      { latAtZero: 41.8, lngAtZero: -87.6 },
    );
    const controlPoints = { eastWest: [{ pageY: 100, lat: 41.9 }], northSouth: [] };
    expect(() => validateControlPoints(controlPoints, transform)).toThrow(ExtractionError);
  });
});

describe("buildCourseData", () => {
  const curated = {
    viewingSpots: [
      {
        id: "spot-a",
        name: "Curated Corner",
        lat: 41.8 + 4 * DEG_LAT_PER_MILE,
        lng: -87.6,
        nearestMile: 99,
        accessNotes: "Red Line to nowhere",
      },
    ],
    travelTimeMatrix: [{ from: "spot-a", to: "spot-a", walkMinutes: 0, transitMinutes: 0 }],
  };
  const input = {
    pagePath: straightPagePath(60),
    curated,
    sourcePdf: "26-BACM-COURSE-MAP-PRINT.pdf",
    // Two control points are the minimum that places the map: one fixes
    // latitude, one longitude. Without them the offset is undetermined.
    controlPoints: { eastWest: [{ pageY: 0, lat: 41.8 }], northSouth: [{ pageX: 300, lng: -87.6 }] },
    knownEndpoints: null,
    printedMileLabels: null,
  };

  // @spec COURSE-016
  it("writes route geometry, mile markers and spot anchors from one run", () => {
    const data = buildCourseData(input);
    expect(data.routeGeometry.length).toBeGreaterThan(1);
    expect(data.mileMarkers).toHaveLength(28);
    expect(data.viewingSpots[0].nearestMile).not.toBe(99);
  });

  // @spec COURSE-011
  it("writes route geometry points carrying coordinates and no distance value", () => {
    const [point] = buildCourseData(input).routeGeometry;
    expect(Object.keys(point).sort()).toEqual(["lat", "lng"]);
  });

  // @spec COURSE-012
  it("writes route geometry in course order, start line first and finish line last", () => {
    const data = buildCourseData(input);
    const first = data.routeGeometry[0];
    const last = data.routeGeometry[data.routeGeometry.length - 1];
    expect(data.mileMarkers[0]).toMatchObject({ mile: 0, lat: expect.closeTo(first.lat, 5) });
    expect(data.mileMarkers[27]).toMatchObject({ mile: 26.2, lat: expect.closeTo(last.lat, 5) });
  });

  // @spec COURSE-015
  it("writes mile markers that lie on the route geometry it writes beside them", () => {
    const data = buildCourseData(input);
    for (const marker of data.mileMarkers) {
      expect(distanceToRouteFeet(marker, data.routeGeometry)).toBeLessThan(50);
    }
  });

  // @spec COURSE-029
  it("preserves each spot's hand-curated fields and the travel-time matrix unchanged", () => {
    const data = buildCourseData(input);
    expect(data.viewingSpots[0]).toMatchObject({
      id: "spot-a",
      name: "Curated Corner",
      accessNotes: "Red Line to nowhere",
      lat: curated.viewingSpots[0].lat,
      lng: curated.viewingSpots[0].lng,
    });
    expect(data.travelTimeMatrix).toEqual(curated.travelTimeMatrix);
  });

  // @spec COURSE-025
  it("records provenance naming the source PDF and what was generated from it", () => {
    const data = buildCourseData(input);
    expect(data._provenance.sourcePdf).toBe("26-BACM-COURSE-MAP-PRINT.pdf");
    expect(data._provenance.generated).toEqual(
      expect.arrayContaining(["routeGeometry", "mileMarkers", "viewingSpots[].nearestMile"]),
    );
  });

  // @spec COURSE-024
  it("throws instead of returning partial data when a gate fails", () => {
    expect(() =>
      buildCourseData({ ...input, knownEndpoints: { start: { lat: 41.9, lng: -87.6 }, finish: { lat: 41.9, lng: -87.6 } } }),
    ).toThrow(ExtractionError);
  });

  // @spec COURSE-024
  it("leaves the existing data file untouched when a gate fails", () => {
    const writes = [];
    expect(() =>
      extractCourseData({
        ...input,
        knownEndpoints: { start: { lat: 41.9, lng: -87.6 }, finish: { lat: 41.9, lng: -87.6 } },
        write: (contents) => writes.push(contents),
      }),
    ).toThrow(ExtractionError);
    expect(writes).toEqual([]);
  });

  // @spec COURSE-016
  it("writes the data file exactly once on a clean run", () => {
    const writes = [];
    extractCourseData({ ...input, write: (contents) => writes.push(contents) });
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]).routeGeometry.length).toBeGreaterThan(1);
  });
});

// Perpendicular distance from a point to the nearest point on the polyline,
// in feet. Local flat-earth approximation: fine over a few miles of Chicago.
function distanceToRouteFeet(point, geometry) {
  const FT_PER_DEG_LAT = 364_000;
  const ftPerDegLng = FT_PER_DEG_LAT * Math.cos((point.lat * Math.PI) / 180);
  let best = Infinity;
  for (let i = 0; i < geometry.length - 1; i += 1) {
    const ay = geometry[i].lat * FT_PER_DEG_LAT;
    const ax = geometry[i].lng * ftPerDegLng;
    const by = geometry[i + 1].lat * FT_PER_DEG_LAT;
    const bx = geometry[i + 1].lng * ftPerDegLng;
    const py = point.lat * FT_PER_DEG_LAT;
    const px = point.lng * ftPerDegLng;
    const dy = by - ay;
    const dx = bx - ax;
    const lengthSquared = dy * dy + dx * dx;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((py - ay) * dy + (px - ax) * dx) / lengthSquared));
    best = Math.min(best, Math.hypot(py - ay - t * dy, px - ax - t * dx));
  }
  return best;
}
