// Verifies the course data actually checked into the repo, not a synthetic
// fixture. These are the checks that hold the generated artifact to the
// invariants the extraction guarantees by construction — see course-data's
// "curation decides whether the data is correct" division of labor. They run
// against the artifact rather than the generator, so a stale committed file
// fails here even though a fresh extraction would pass.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadCourseData } from "./course-data.js";

const shipped = JSON.parse(readFileSync(new URL("../public/data/course-data.json", import.meta.url), "utf8"));

// The same mile the data is built on: one degree of latitude is 69.0547 miles
// (see tools/extract-course-data.mjs). A rounder constant measures a different
// mile and would put this test's arithmetic at odds with COURSE-013's.
const MILES_PER_DEG_LAT = 69.0547;
const FT_PER_DEG_LAT = MILES_PER_DEG_LAT * 5280;

function feetBetween(a, b) {
  const ftPerDegLng = FT_PER_DEG_LAT * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot((b.lat - a.lat) * FT_PER_DEG_LAT, (b.lng - a.lng) * ftPerDegLng);
}

// Perpendicular distance onto the nearest segment, with how far along the route
// that projection sits. Segment projection rather than nearest vertex: vertices
// follow the course's turns and can be a third of a mile apart, so a point can
// sit on the route while no vertex is anywhere near it.
function projectOntoRoute(point, geometry, cumulative) {
  const ftPerDegLng = FT_PER_DEG_LAT * Math.cos((point.lat * Math.PI) / 180);
  const py = point.lat * FT_PER_DEG_LAT;
  const px = point.lng * ftPerDegLng;
  let best = { feet: Infinity, mile: 0 };
  for (let i = 0; i < geometry.length - 1; i += 1) {
    const ay = geometry[i].lat * FT_PER_DEG_LAT;
    const ax = geometry[i].lng * ftPerDegLng;
    const dy = geometry[i + 1].lat * FT_PER_DEG_LAT - ay;
    const dx = geometry[i + 1].lng * ftPerDegLng - ax;
    const lengthSquared = dy * dy + dx * dx;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((py - ay) * dy + (px - ax) * dx) / lengthSquared));
    const feet = Math.hypot(py - ay - t * dy, px - ax - t * dx);
    if (feet < best.feet) {
      best = { feet, mile: cumulative[i] + (t * Math.sqrt(lengthSquared)) / 5280 };
    }
  }
  return best;
}

const distanceToRouteFeet = (point, geometry) => projectOntoRoute(point, geometry, milesAlong(geometry)).feet;

// The point a given distance along the route — the walk the mile markers were
// emitted by, re-done here against the committed geometry.
function pointAtMile(geometry, cumulative, mile) {
  const total = cumulative[cumulative.length - 1];
  if (mile <= 0) return geometry[0];
  if (mile >= total) return geometry[geometry.length - 1];
  let i = 0;
  while (i < cumulative.length - 2 && cumulative[i + 1] < mile) i += 1;
  const span = cumulative[i + 1] - cumulative[i];
  const t = span === 0 ? 0 : (mile - cumulative[i]) / span;
  return {
    lat: geometry[i].lat + t * (geometry[i + 1].lat - geometry[i].lat),
    lng: geometry[i].lng + t * (geometry[i + 1].lng - geometry[i].lng),
  };
}

function milesAlong(geometry) {
  const cumulative = [0];
  for (let i = 0; i < geometry.length - 1; i += 1) {
    cumulative.push(cumulative[i] + feetBetween(geometry[i], geometry[i + 1]) / 5280);
  }
  return cumulative;
}

describe("the course data checked into the repo", () => {
  // @spec COURSE-011
  it("carries route geometry points of coordinates only, with no distance value", () => {
    expect(Array.isArray(shipped.routeGeometry)).toBe(true);
    expect(shipped.routeGeometry.length).toBeGreaterThan(2);
    for (const point of shipped.routeGeometry) {
      expect(Object.keys(point).sort()).toEqual(["lat", "lng"]);
    }
  });

  // @spec COURSE-012
  it("orders route geometry from the start line to the finish line", () => {
    const markers = shipped.mileMarkers;
    const start = markers.find((m) => m.mile === 0);
    const finish = markers.find((m) => m.mile === 26.2);
    expect(feetBetween(shipped.routeGeometry[0], start)).toBeLessThan(100);
    expect(feetBetween(shipped.routeGeometry[shipped.routeGeometry.length - 1], finish)).toBeLessThan(100);
  });

  // @spec COURSE-013
  it("traces a route that measures the race distance", () => {
    const cumulative = milesAlong(shipped.routeGeometry);
    expect(cumulative[cumulative.length - 1]).toBeCloseTo(26.2, 2);
  });

  // @spec COURSE-015
  it("puts every mile marker on the route geometry, at the distance it claims", () => {
    const geometry = shipped.routeGeometry;
    const cumulative = milesAlong(geometry);
    for (const marker of shipped.mileMarkers) {
      expect(distanceToRouteFeet(marker, geometry)).toBeLessThan(100);

      // ...and at the distance it claims, not merely somewhere on the route.
      // Checked by re-walking the geometry rather than by looking for the
      // nearest vertex: the course retraces itself, so the vertex nearest a
      // marker can belong to another pass entirely.
      expect(feetBetween(pointAtMile(geometry, cumulative, marker.mile), marker)).toBeLessThan(100);
    }
  });

  // @spec COURSE-027
  it("anchors every viewing spot to the earliest point the route passes within 500 ft of it", () => {
    const geometry = shipped.routeGeometry;
    const cumulative = milesAlong(geometry);
    for (const spot of shipped.viewingSpots) {
      // Every stretch where the course comes within sighting range, in order.
      const passes = [];
      let inRange = false;
      for (let i = 0; i < geometry.length - 1; i += 1) {
        const { feet, mile } = projectOntoRoute(spot, [geometry[i], geometry[i + 1]], [cumulative[i]]);
        if (feet <= 500) {
          if (!inRange) passes.push(mile);
          inRange = true;
        } else {
          inRange = false;
        }
      }
      expect(passes.length).toBeGreaterThan(0);
      expect(spot.nearestMile).toBeCloseTo(Math.min(...passes), 1);
    }
  });

  // @spec COURSE-028
  it("curates no viewing spot the route never passes within 500 ft of", () => {
    for (const spot of shipped.viewingSpots) {
      expect(distanceToRouteFeet(spot, shipped.routeGeometry)).toBeLessThan(500);
    }
  });

  // @spec COURSE-025
  it("records the course map it was generated from", () => {
    expect(shipped._provenance.sourcePdf).toMatch(/\.pdf$/i);
  });

  // @spec COURSE-007
  it("loads cleanly through the app's own validation", () => {
    expect(() => loadCourseData(shipped)).not.toThrow();
  });
});

describe("the drift check CI runs", () => {
  // @spec COURSE-030
  it("reports the committed data file as matching a fresh extraction from the map", () => {
    const result = spawnSync("node", ["tools/extract-course-data-cli.mjs", "--check"], {
      cwd: new URL("..", import.meta.url).pathname,
      encoding: "utf8",
    });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});
