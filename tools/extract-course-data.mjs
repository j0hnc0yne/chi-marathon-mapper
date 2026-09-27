// Extracts the Chicago Marathon course from the official course map PDF.
//
// The published map is vector artwork: the course is a drawn path and each
// printed mile number is a text object at a known position. This reads both out
// rather than eyeballing them off an image. See
// docs/intent/course-data/course-data-design.md § Curation for the design.
//
// @spec COURSE-016
import { inflateSync } from "node:zlib";

export class ExtractionError extends Error {
  constructor(message) {
    super(message);
    this.name = "ExtractionError";
  }
}

// One degree of latitude in miles. Every distance in this module is derived
// from this one constant so the geometry, the mile walk and the gates all
// measure the course the same way.
const MILES_PER_DEGREE_LATITUDE = 69.0547;
const EARTH_RADIUS_MILES = (MILES_PER_DEGREE_LATITUDE * 180) / Math.PI;
const FEET_PER_MILE = 5280;

const SIGHTING_RANGE_FEET = 500;
const MILE_LABEL_TOLERANCE_FEET = 2000;
// How far from its nominal mile a printed label may sit and still be read as
// that mile. Wider than the gate, so a label that is found but misplaced fails
// the gate rather than going unmatched. Kilometre markers are printed too, and
// the k'th sits at 0.621k miles — far enough from mile k for every kilometre
// label on this map to be excluded by this window.
const MILE_LABEL_MATCH_WINDOW_MILES = 0.6;
const ENDPOINT_TOLERANCE_FEET = 300;
const CONTROL_POINT_TOLERANCE_FEET = 1000;

const radians = (degrees) => (degrees * Math.PI) / 180;

// @spec COURSE-013
export function routeLengthMiles(points) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    total += greatCircleMiles(points[i], points[i + 1]);
  }
  return total;
}

function greatCircleMiles(a, b) {
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

const feetBetween = (a, b) => greatCircleMiles(a, b) * FEET_PER_MILE;

// ---------------------------------------------------------------------------
// PDF plumbing
// ---------------------------------------------------------------------------

function findObject(pdf, number) {
  const marker = `\n${number} 0 obj`;
  let at = pdf.indexOf(marker);
  if (at === -1) at = pdf.indexOf(`\r${number} 0 obj`);
  if (at === -1) throw new ExtractionError(`PDF object ${number} not found`);
  const end = pdf.indexOf("endobj", at);
  return pdf.slice(at + marker.length, end);
}

/** The page's content stream, inflated to drawing operators. */
export function readPageContent(pdfBytes) {
  const pdf = pdfBytes.toString("latin1");
  const pageMatch = pdf.match(/\/Contents (\d+) 0 R/);
  if (!pageMatch) throw new ExtractionError("PDF has no page content stream reference");
  const body = findObject(pdf, Number(pageMatch[1]));
  const streamAt = body.indexOf("stream");
  if (streamAt === -1) throw new ExtractionError("PDF page contents object holds no stream");
  const raw = body.slice(streamAt + "stream".length).replace(/^\r?\n/, "");
  const deflated = raw.slice(0, raw.lastIndexOf("endstream"));
  return inflateSync(Buffer.from(deflated, "latin1")).toString("latin1");
}

const multiply = (m, n) => [
  m[0] * n[0] + m[1] * n[2],
  m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4],
  m[4] * n[1] + m[5] * n[3] + n[5],
];
const applyMatrix = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

const IDENTITY = [1, 0, 0, 1, 0, 0];
const PAINT_OPS = new Set(["f", "F", "f*", "S", "s", "B", "B*", "b", "b*", "n"]);

/**
 * Interprets the drawing operators into paths in page coordinates, carrying the
 * paint operator and colour state each was drawn with — which is how the course
 * is told apart from the street network.
 */
export function parseContentStream(content) {
  const withoutText = content.replace(/BT[\s\S]*?ET/g, " ");
  const tokens = withoutText.match(/\/[A-Za-z0-9#]+|[-+]?[\d.]+|[A-Za-z*'"]+/g) ?? [];

  const paths = [];
  const stack = [];
  let ctm = IDENTITY;
  let fill = null;
  let stroke = null;
  let lineWidth = 1;
  let operands = [];
  let subpaths = [];
  let current = [];

  const finish = (op) => {
    if (current.length) subpaths.push(current);
    if (subpaths.length) paths.push({ op, fill, stroke, lw: lineWidth, sub: subpaths });
    subpaths = [];
    current = [];
  };
  const numbers = (count) => operands.slice(-count).map(Number);

  for (const token of tokens) {
    if (/^[-+]?[\d.]+$/.test(token) || token.startsWith("/")) {
      operands.push(token);
      continue;
    }
    switch (token) {
      case "q":
        stack.push([ctm, fill, stroke, lineWidth]);
        break;
      case "Q":
        if (stack.length) [ctm, fill, stroke, lineWidth] = stack.pop();
        break;
      case "cm":
        if (operands.length >= 6) ctm = multiply(numbers(6), ctm);
        break;
      case "w":
        if (operands.length) lineWidth = Number(operands.at(-1));
        break;
      case "k":
        fill = ["k", numbers(4)];
        break;
      case "K":
        stroke = ["K", numbers(4)];
        break;
      case "g":
        fill = ["g", numbers(1)];
        break;
      case "G":
        stroke = ["G", numbers(1)];
        break;
      case "rg":
        fill = ["rg", numbers(3)];
        break;
      case "RG":
        stroke = ["RG", numbers(3)];
        break;
      case "scn":
        fill = ["scn", operands.filter((o) => !o.startsWith("/")).map(Number)];
        break;
      case "SCN":
        stroke = ["SCN", operands.filter((o) => !o.startsWith("/")).map(Number)];
        break;
      case "m":
        if (current.length) subpaths.push(current);
        current = [applyMatrix(ctm, ...numbers(2))];
        break;
      case "l":
        current.push(applyMatrix(ctm, ...numbers(2)));
        break;
      // Curves are recorded by their endpoint: the course is drawn almost
      // entirely as straight runs down streets, with a single curve in it.
      case "c":
      case "v":
      case "y":
        current.push(applyMatrix(ctm, ...operands.slice(-2).map(Number)));
        break;
      case "re": {
        const [x, y, w, h] = numbers(4);
        if (current.length) subpaths.push(current);
        subpaths.push([
          applyMatrix(ctm, x, y),
          applyMatrix(ctm, x + w, y),
          applyMatrix(ctm, x + w, y + h),
          applyMatrix(ctm, x, y + h),
          applyMatrix(ctm, x, y),
        ]);
        current = [];
        break;
      }
      case "h":
        if (current.length > 1) current.push(current[0]);
        break;
      default:
        if (PAINT_OPS.has(token)) finish(token);
    }
    operands = [];
  }
  return paths;
}

/** Text objects with their page positions — the printed mile and street labels. */
export function parseTextLabels(content) {
  const labels = [];
  const stack = [];
  let ctm = IDENTITY;
  const pattern = /\bq\b|\bQ\b|([-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+) cm\b|BT([\s\S]*?)ET/g;

  for (const match of content.matchAll(pattern)) {
    if (match[0] === "q") stack.push(ctm);
    else if (match[0] === "Q") ctm = stack.pop() ?? ctm;
    else if (match[1]) ctm = multiply(match[1].split(" ").map(Number), ctm);
    else if (match[2] !== undefined) {
      let position = null;
      let text = [];
      const inner =
        /([-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+) Tm\b|\(((?:[^()\\]|\\.)*)\)\s*Tj\b|\[((?:[^\][]|\\.)*)\]\s*TJ\b/g;
      for (const part of match[2].matchAll(inner)) {
        if (part[1]) {
          if (position && text.length) labels.push({ x: position[0], y: position[1], text: clean(text.join("")) });
          text = [];
          const m = multiply(part[1].split(" ").map(Number), ctm);
          position = [m[4], m[5]];
        } else if (part[2] !== undefined) text.push(part[2]);
        else if (part[3] !== undefined) {
          for (const piece of part[3].matchAll(/\(((?:[^()\\]|\\.)*)\)/g)) text.push(piece[1]);
        }
      }
      if (position && text.length) labels.push({ x: position[0], y: position[1], text: clean(text.join("")) });
    }
  }
  return labels.filter((l) => l.text);
}

const clean = (text) => text.replace(/\\(\d{3}|.)/g, "").trim();

/**
 * The course, identified by the styling it alone is drawn with: a 2pt stroke in
 * the map's spot colour. The same style also draws the scale bar, which is
 * excluded by length — a 26-mile course is not two points long.
 *
 * @spec COURSE-017
 */
export function findCoursePath(paths) {
  const candidates = [];
  for (const path of paths) {
    const isCourseStyle = path.op === "S" && path.stroke?.[0] === "SCN" && Math.abs(path.lw - 2) < 1e-6;
    if (!isCourseStyle) continue;
    for (const subpath of path.sub) {
      if (subpath.length > 50) candidates.push(subpath);
    }
  }
  if (candidates.length === 0) {
    throw new ExtractionError("No path in the course's drawing style was found — the map's styling has changed");
  }
  if (candidates.length > 1) {
    throw new ExtractionError(
      `${candidates.length} paths match the course's drawing style — refusing to guess which is the course`,
    );
  }
  return candidates[0];
}

// ---------------------------------------------------------------------------
// Georeferencing
// ---------------------------------------------------------------------------

const pagePathLength = (pagePath) => {
  let total = 0;
  for (let i = 0; i < pagePath.length - 1; i += 1) {
    total += Math.hypot(pagePath[i + 1][0] - pagePath[i][0], pagePath[i + 1][1] - pagePath[i][1]);
  }
  return total;
};

/**
 * Solves the scale from the certified race distance rather than from the street
 * labels: 26.2 miles is known to a precision no street-coordinate table can
 * match. The projection is treated as conformal, so a degree of longitude
 * covers less ground than a degree of latitude by exactly 1/cos(latitude).
 *
 * @spec COURSE-018
 */
export function solveScale(pagePath, { targetMiles, referenceLat }) {
  const degLatPerPoint = targetMiles / (MILES_PER_DEGREE_LATITUDE * pagePathLength(pagePath));
  return { degLatPerPoint, degLngPerPoint: degLatPerPoint / Math.cos(radians(referenceLat)) };
}

/** @spec COURSE-018 */
export function solveOffset({ eastWest = [], northSouth = [] }, scale) {
  const mean = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;
  return {
    latAtZero: eastWest.length ? mean(eastWest.map((c) => c.lat - scale.degLatPerPoint * c.pageY)) : 0,
    lngAtZero: northSouth.length ? mean(northSouth.map((c) => c.lng - scale.degLngPerPoint * c.pageX)) : 0,
  };
}

export function makeTransform(scale, offset) {
  return {
    scale,
    offset,
    toLatLng(x, y) {
      return {
        lat: offset.latAtZero + scale.degLatPerPoint * y,
        lng: offset.lngAtZero + scale.degLngPerPoint * x,
      };
    },
  };
}

export function georeference(pagePath, transform) {
  return pagePath.map(([x, y]) => transform.toLatLng(x, y));
}

/** Cumulative miles from the start at each geometry point. @spec COURSE-013 */
export function cumulativeMiles(geometry) {
  const cumulative = [0];
  for (let i = 0; i < geometry.length - 1; i += 1) {
    cumulative.push(cumulative[i] + greatCircleMiles(geometry[i], geometry[i + 1]));
  }
  return cumulative;
}

/**
 * The point a given distance along the route, interpolated within the segment
 * that distance falls in. Never snapped to a vertex: vertices follow the
 * course's turns, not a distance interval, so on a long straight stretch the
 * nearest vertex can be most of a mile from the mile it would be marking.
 *
 * @spec COURSE-020
 */
export function pointAtMile(geometry, cumulative, mile) {
  if (mile <= 0) return { ...geometry[0] };
  const total = cumulative[cumulative.length - 1];
  if (mile >= total) return { ...geometry[geometry.length - 1] };
  let i = 0;
  while (i < cumulative.length - 2 && cumulative[i + 1] < mile) i += 1;
  const span = cumulative[i + 1] - cumulative[i];
  const t = span === 0 ? 0 : (mile - cumulative[i]) / span;
  return {
    lat: geometry[i].lat + t * (geometry[i + 1].lat - geometry[i].lat),
    lng: geometry[i].lng + t * (geometry[i + 1].lng - geometry[i].lng),
  };
}

/** @spec COURSE-019 */
export function emitMileMarkers(geometry) {
  const cumulative = cumulativeMiles(geometry);
  const miles = [...Array.from({ length: 27 }, (_, i) => i), 26.2];
  return miles.map((mile) => {
    const { lat, lng } = pointAtMile(geometry, cumulative, mile);
    return { mile, lat: round(lat), lng: round(lng) };
  });
}

const round = (value) => Number(value.toFixed(5));

/** Every point where the route comes within sighting range, as miles from the start. */
function sightingPasses(spot, geometry, cumulative) {
  const passes = [];
  let inRange = false;
  for (let i = 0; i < geometry.length - 1; i += 1) {
    const projected = projectOntoSegment(spot, geometry[i], geometry[i + 1]);
    if (projected.feet <= SIGHTING_RANGE_FEET) {
      if (!inRange) passes.push(cumulative[i] + projected.milesIntoSegment);
      inRange = true;
    } else {
      inRange = false;
    }
  }
  return passes;
}

/** Nearest point on the whole route: how far off, and how far along. */
function projectOntoRoute(point, geometry, cumulative) {
  let best = { feet: Infinity, mile: 0 };
  for (let i = 0; i < geometry.length - 1; i += 1) {
    const projected = projectOntoSegment(point, geometry[i], geometry[i + 1]);
    if (projected.feet < best.feet) {
      best = { feet: projected.feet, mile: cumulative[i] + projected.milesIntoSegment };
    }
  }
  return best;
}

function projectOntoSegment(point, a, b) {
  const ftPerDegLat = MILES_PER_DEGREE_LATITUDE * FEET_PER_MILE;
  const ftPerDegLng = ftPerDegLat * Math.cos(radians(point.lat));
  const ay = a.lat * ftPerDegLat;
  const ax = a.lng * ftPerDegLng;
  const dy = b.lat * ftPerDegLat - ay;
  const dx = b.lng * ftPerDegLng - ax;
  const lengthSquared = dy * dy + dx * dx;
  const py = point.lat * ftPerDegLat - ay;
  const px = point.lng * ftPerDegLng - ax;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (py * dy + px * dx) / lengthSquared));
  return {
    feet: Math.hypot(py - t * dy, px - t * dx),
    milesIntoSegment: (t * Math.sqrt(lengthSquared)) / FEET_PER_MILE,
  };
}

/**
 * Where on the course a viewing spot sits. The course retraces itself, so a
 * spot can be passed more than once; the earliest pass within sighting range
 * wins. A spectator told the first time they can see their runner can stay for
 * a later pass, while one told the last has already missed the earlier.
 *
 * @spec COURSE-027, COURSE-028
 */
export function anchorSpot(spot, geometry, cumulative) {
  const passes = sightingPasses(spot, geometry, cumulative);
  if (passes.length === 0) {
    throw new ExtractionError(
      `The course never passes within ${SIGHTING_RANGE_FEET} ft of viewing spot "${spot.id ?? spot.name}"`,
    );
  }
  return Number(Math.min(...passes).toFixed(2));
}

/**
 * Pairs each printed number on the map with the mile it labels, by where it sits
 * along the route. Every mile from 1 to 26 must be accounted for: if the fit
 * were wrong, the printed labels would stop lining up with the walk and the
 * matching would come up short.
 *
 * @spec COURSE-021
 */
export function matchPrintedMileLabels(geometry, labelPoints) {
  const cumulative = cumulativeMiles(geometry);
  const matched = {};
  for (const label of labelPoints) {
    if (!Number.isInteger(label.value) || label.value < 1 || label.value > 26) continue;
    const { feet, mile } = projectOntoRoute(label, geometry, cumulative);
    if (feet > MILE_LABEL_TOLERANCE_FEET) continue;
    if (Math.abs(mile - label.value) > MILE_LABEL_MATCH_WINDOW_MILES) continue;
    matched[label.value] = { lat: label.lat, lng: label.lng };
  }
  const missing = [];
  for (let mile = 1; mile <= 26; mile += 1) if (!matched[mile]) missing.push(mile);
  if (missing.length) {
    throw new ExtractionError(
      `No printed label on the map could be matched to mile${missing.length > 1 ? "s" : ""} ${missing.join(", ")} — ` +
        "the georeference or the course path is wrong",
    );
  }
  return matched;
}

/**
 * Printed mile numbers against the computed walk. The tolerance is loose
 * because the labels are set beside the course with leader lines; what this
 * detects is gross failure — a backwards walk throws miles tens of thousands
 * of feet off, not hundreds.
 *
 * @spec COURSE-021
 */
export function validateMileLabels(geometry, printedLabels) {
  if (!printedLabels) return;
  const cumulative = cumulativeMiles(geometry);
  for (const [mile, printed] of Object.entries(printedLabels)) {
    const computed = pointAtMile(geometry, cumulative, Number(mile));
    const off = feetBetween(computed, printed);
    if (off > MILE_LABEL_TOLERANCE_FEET) {
      throw new ExtractionError(
        `Mile ${mile} computes ${Math.round(off)} ft from its printed label on the map ` +
          `(tolerance ${MILE_LABEL_TOLERANCE_FEET} ft)`,
      );
    }
  }
}

/**
 * Puts the path in course order. The order a path is drawn in is a fact about
 * the artwork, not about the race — this map happens to draw the course from the
 * finish backwards — so course order is established by matching the ends to the
 * known start and finish rather than assumed.
 *
 * @spec COURSE-012, COURSE-031
 */
export function orientToCourse(geometry, known) {
  if (!known) return geometry;
  const reversed = [...geometry].reverse();
  const misfit = (candidate) =>
    feetBetween(candidate[0], known.start) + feetBetween(candidate[candidate.length - 1], known.finish);
  return misfit(reversed) < misfit(geometry) ? reversed : geometry;
}

/**
 * Both ends against their known locations. Because the path is oriented by
 * matching those same ends, this no longer detects a reversed path — that is
 * settled by construction. What it detects is a fit that is wrong in neither
 * orientation: a mis-scaled projection, or a path that is not the course.
 *
 * @spec COURSE-022
 */
export function validateEndpoints(geometry, known) {
  if (!known) return;
  const checks = [
    ["start", geometry[0], known.start],
    ["finish", geometry[geometry.length - 1], known.finish],
  ];
  for (const [name, computed, expected] of checks) {
    const off = feetBetween(computed, expected);
    if (off > ENDPOINT_TOLERANCE_FEET) {
      throw new ExtractionError(
        `The route's ${name} resolves ${Math.round(off)} ft from its known location ` +
          `(tolerance ${ENDPOINT_TOLERANCE_FEET} ft) in either orientation`,
      );
    }
  }
}

/** @spec COURSE-023 */
export function validateControlPoints({ eastWest = [], northSouth = [] }, transform) {
  const ftPerDegLat = MILES_PER_DEGREE_LATITUDE * FEET_PER_MILE;
  for (const control of eastWest) {
    const off = Math.abs(transform.toLatLng(0, control.pageY).lat - control.lat) * ftPerDegLat;
    if (off > CONTROL_POINT_TOLERANCE_FEET) {
      throw new ExtractionError(
        `Control point "${control.label ?? "east-west"}" fits ${Math.round(off)} ft from its known latitude`,
      );
    }
  }
  for (const control of northSouth) {
    const off =
      Math.abs(transform.toLatLng(control.pageX, 0).lng - control.lng) *
      ftPerDegLat *
      Math.cos(radians(transform.offset.latAtZero || 41.87));
    if (off > CONTROL_POINT_TOLERANCE_FEET) {
      throw new ExtractionError(
        `Control point "${control.label ?? "north-south"}" fits ${Math.round(off)} ft from its known longitude`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

const RACE_MILES = 26.2;
const REFERENCE_LAT = 41.8721;

/**
 * Builds the whole data file from one reading of the map. Geometry, mile
 * markers and spot anchors come out of a single run, which is what makes
 * "every marker lies on the route" true by construction rather than policed.
 *
 * @spec COURSE-015, COURSE-016, COURSE-025, COURSE-029
 */
export function buildCourseData({ pagePath, curated, sourcePdf, controlPoints, knownEndpoints, printedMileLabels }) {
  let transform = fitProjection(pagePath, controlPoints);
  // The conformal model uses one reference latitude, so the measured length
  // lands a hair off the target. Re-solve against the real measurement until it
  // converges; the offset shifts with the scale, so both are refit each pass.
  for (let pass = 0; pass < 6; pass += 1) {
    const measured = routeLengthMiles(georeference(pagePath, transform));
    const scale = {
      degLatPerPoint: (transform.scale.degLatPerPoint * RACE_MILES) / measured,
      degLngPerPoint: (transform.scale.degLngPerPoint * RACE_MILES) / measured,
    };
    transform = makeTransform(scale, solveOffset(controlPoints, scale));
  }

  validateControlPoints(controlPoints, transform);

  const routeGeometry = orientToCourse(
    georeference(pagePath, transform).map(({ lat, lng }) => ({ lat: round(lat), lng: round(lng) })),
    knownEndpoints,
  );
  validateEndpoints(routeGeometry, knownEndpoints);
  if (printedMileLabels) {
    const labelPoints = printedMileLabels.map(({ value, x, y }) => ({ value, ...transform.toLatLng(x, y) }));
    validateMileLabels(routeGeometry, matchPrintedMileLabels(routeGeometry, labelPoints));
  }

  const cumulative = cumulativeMiles(routeGeometry);
  const mileMarkers = emitMileMarkers(routeGeometry);
  const viewingSpots = curated.viewingSpots.map((spot) => ({
    ...spot,
    nearestMile: anchorSpot(spot, routeGeometry, cumulative),
  }));

  return {
    _provenance: {
      sourcePdf,
      generated: ["routeGeometry", "mileMarkers", "viewingSpots[].nearestMile"],
      handCurated: ["viewingSpots[].name/lat/lng/accessNotes", "travelTimeMatrix"],
      note: "Generated by tools/extract-course-data.mjs — do not hand-edit; re-run the script instead.",
    },
    routeGeometry,
    mileMarkers,
    viewingSpots,
    travelTimeMatrix: curated.travelTimeMatrix,
  };
}

function fitProjection(pagePath, controlPoints) {
  const scale = solveScale(pagePath, { targetMiles: RACE_MILES, referenceLat: REFERENCE_LAT });
  return makeTransform(scale, solveOffset(controlPoints, scale));
}

/**
 * Builds and writes. Every gate throws, so a failing gate means `write` is
 * never reached and the committed data file is left as it stands.
 *
 * @spec COURSE-024
 */
export function extractCourseData({ write, ...input }) {
  const data = buildCourseData(input);
  write(`${JSON.stringify(data, null, 2)}\n`);
  return data;
}
