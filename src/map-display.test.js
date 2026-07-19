// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  MapsLoadError,
  buildMapsScriptUrl,
  loadMapsApi,
  renderMileMarkers,
  renderPlan,
  renderRoute,
  renderSuggestedStops,
  resolveClickPriority,
} from "./map-display.js";

function createFakeMapsApi() {
  const created = { markers: [], infoWindows: [], polylines: [] };
  class Marker {
    constructor(opts) {
      this.opts = opts;
      created.markers.push(this);
    }
    addListener() {}
  }
  class InfoWindow {
    constructor(opts) {
      this.opts = opts;
      created.infoWindows.push(this);
    }
    open() {
      this.opened = true;
    }
  }
  class Polyline {
    constructor(opts) {
      this.opts = opts;
      created.polylines.push(this);
    }
  }
  return { Marker, InfoWindow, Polyline, __created: created };
}

const FAKE_MAP = {}; // renderers only pass this through to constructor opts; no real map instance needed

describe("renderRoute", () => {
  // @spec MAP-001
  it("draws a polyline connecting the course's mile markers", () => {
    const mapsApi = createFakeMapsApi();
    const mileMarkers = [
      { mile: 0, lat: 41.87, lng: -87.67 },
      { mile: 1, lat: 41.88, lng: -87.66 },
    ];
    renderRoute(FAKE_MAP, mapsApi, mileMarkers);
    expect(mapsApi.__created.polylines).toHaveLength(1);
    expect(mapsApi.__created.polylines[0].opts.path).toEqual([
      { lat: 41.87, lng: -87.67 },
      { lat: 41.88, lng: -87.66 },
    ]);
  });
});

describe("renderMileMarkers", () => {
  // @spec MAP-002
  it("places a marker at each mile marker point", () => {
    const mapsApi = createFakeMapsApi();
    const points = [
      { mile: 0, lat: 41.87, lng: -87.67, predictedTime: new Date("2025-10-12T07:30:00-05:00") },
      { mile: 1, lat: 41.88, lng: -87.66, predictedTime: new Date("2025-10-12T07:40:00-05:00") },
    ];
    renderMileMarkers(FAKE_MAP, mapsApi, points);
    expect(mapsApi.__created.markers).toHaveLength(2);
  });

  // @spec MAP-003
  it("shows predicted clock time in an info window on click rather than an always-on label", () => {
    const mapsApi = createFakeMapsApi();
    const points = [{ mile: 3, lat: 41.9, lng: -87.6, predictedTime: new Date("2025-10-12T08:00:00-05:00") }];
    const [record] = renderMileMarkers(FAKE_MAP, mapsApi, points);
    expect(record.marker.opts.label).toBeUndefined();
    expect(record.infoWindow.opts.content).toContain("08:00");
  });
});

describe("renderSuggestedStops", () => {
  // @spec MAP-004
  it("uses a marker style visually distinct from plain mile markers", () => {
    const mapsApi = createFakeMapsApi();
    const stops = [
      {
        spot: { id: "s1", name: "Clark & Eugenie", approximatedMile: false },
        predictedTime: new Date("2025-10-12T08:00:00-05:00"),
        arrivalSlack: 5,
        sequence: 1,
      },
    ];
    const [record] = renderSuggestedStops(FAKE_MAP, mapsApi, stops);
    expect(record.marker.opts.icon).toBeDefined();
  });

  // @spec MAP-005
  it("includes predicted clock time, sequence number, and arrival slack in the info window", () => {
    const mapsApi = createFakeMapsApi();
    const stops = [
      {
        spot: { id: "s1", name: "Clark & Eugenie", approximatedMile: false },
        predictedTime: new Date("2025-10-12T08:00:00-05:00"),
        arrivalSlack: 5,
        sequence: 1,
      },
    ];
    const [record] = renderSuggestedStops(FAKE_MAP, mapsApi, stops);
    expect(record.infoWindow.opts.content).toContain("08:00");
    expect(record.infoWindow.opts.content).toContain("1");
    expect(record.infoWindow.opts.content).toContain("5");
  });

  // @spec MAP-005
  it("notes when the underlying spot's time is approximated", () => {
    const mapsApi = createFakeMapsApi();
    const stops = [
      {
        spot: { id: "s1", name: "Clark & Eugenie", approximatedMile: true },
        predictedTime: new Date("2025-10-12T08:00:00-05:00"),
        arrivalSlack: 5,
        sequence: 1,
      },
    ];
    const [record] = renderSuggestedStops(FAKE_MAP, mapsApi, stops);
    expect(record.infoWindow.opts.content.toLowerCase()).toContain("approximate");
  });
});

describe("stacking and click priority", () => {
  // @spec MAP-008
  it("draws both a suggested-stop marker and a coincident plain marker rather than suppressing one", () => {
    const mapsApi = createFakeMapsApi();
    const coord = { lat: 41.9, lng: -87.6 };
    renderMileMarkers(FAKE_MAP, mapsApi, [
      { mile: 3, ...coord, predictedTime: new Date("2025-10-12T08:00:00-05:00") },
    ]);
    renderSuggestedStops(FAKE_MAP, mapsApi, [
      {
        spot: { id: "s1", name: "Clark & Eugenie", ...coord, approximatedMile: false },
        predictedTime: new Date("2025-10-12T08:00:00-05:00"),
        arrivalSlack: 5,
        sequence: 1,
      },
    ]);
    expect(mapsApi.__created.markers).toHaveLength(2);
  });

  // @spec MAP-009
  it("resolves click priority to the suggested stop over a plain mile marker", () => {
    const plain = { kind: "plain", marker: {} };
    const suggested = { kind: "suggested", marker: {} };
    expect(resolveClickPriority([plain, suggested])).toBe(suggested);
    expect(resolveClickPriority([suggested, plain])).toBe(suggested);
  });
});

describe("renderPlan state rendering", () => {
  // @spec MAP-006
  it("renders only the bare route while no valid input/plan is in effect", () => {
    const mapsApi = createFakeMapsApi();
    const container = document.createElement("div");
    renderPlan(FAKE_MAP, mapsApi, container, {
      courseMileMarkers: [
        { mile: 0, lat: 41.87, lng: -87.67 },
        { mile: 1, lat: 41.88, lng: -87.66 },
      ],
      mileMarkerTimes: null,
      itinerary: null,
    });
    expect(mapsApi.__created.polylines).toHaveLength(1);
    expect(mapsApi.__created.markers).toHaveLength(0);
  });

  // @spec MAP-007
  it("still renders the one sparse-result stop with full styling, plus a warning message", () => {
    const mapsApi = createFakeMapsApi();
    const container = document.createElement("div");
    renderPlan(FAKE_MAP, mapsApi, container, {
      courseMileMarkers: [{ mile: 0, lat: 41.87, lng: -87.67 }],
      mileMarkerTimes: [{ mile: 0, lat: 41.87, lng: -87.67, predictedTime: new Date("2025-10-12T07:30:00-05:00") }],
      itinerary: {
        sparse: true,
        stops: [
          {
            spot: { id: "s1", name: "Start", approximatedMile: false },
            predictedTime: new Date("2025-10-12T07:30:00-05:00"),
            arrivalSlack: null,
            sequence: 1,
          },
        ],
      },
    });
    expect(mapsApi.__created.markers.length).toBeGreaterThanOrEqual(1);
    expect(container.textContent.toLowerCase()).toContain("no feasible multi-stop plan");
  });

  // @spec MAP-010
  it("displays an explicit error in place of the map when the Maps API failed to load", () => {
    const mapsApi = createFakeMapsApi();
    const container = document.createElement("div");
    renderPlan(FAKE_MAP, mapsApi, container, { mapsError: "Google Maps failed to load." });
    expect(mapsApi.__created.polylines).toHaveLength(0);
    expect(container.textContent).toContain("Google Maps failed to load.");
  });

  // @spec MAP-012
  it("displays an explicit error in place of the map when course data failed to load", () => {
    const mapsApi = createFakeMapsApi();
    const container = document.createElement("div");
    renderPlan(FAKE_MAP, mapsApi, container, { courseError: "Course data is unavailable." });
    expect(mapsApi.__created.polylines).toHaveLength(0);
    expect(container.textContent).toContain("Course data is unavailable.");
  });
});

describe("Google Maps API loading", () => {
  // @spec MAP-010
  it("rejects with an explicit error when the underlying script fails to load", async () => {
    await expect(loadMapsApi(() => Promise.reject(new Error("network down")))).rejects.toBeInstanceOf(
      MapsLoadError,
    );
  });

  // @spec MAP-011
  it("builds the Maps script URL carrying the client-side API key", () => {
    const url = buildMapsScriptUrl("test-api-key");
    expect(url).toContain("key=test-api-key");
  });
});
