// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  MapsLoadError,
  applyThemeToMap,
  createMap,
  buildListRows,
  buildMapsScriptUrl,
  loadMapsApi,
  renderList,
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
  // The course as drawn turns a corner between the two mile markers; geometry
  // carries that corner and the marker list cannot.
  const routeGeometry = [
    { lat: 41.87, lng: -87.67 },
    { lat: 41.875, lng: -87.67 },
    { lat: 41.875, lng: -87.66 },
    { lat: 41.88, lng: -87.66 },
  ];

  // @spec MAP-001
  it("draws a polyline following every point of the course's route geometry, in order", () => {
    const mapsApi = createFakeMapsApi();
    renderRoute(FAKE_MAP, mapsApi, routeGeometry);
    expect(mapsApi.__created.polylines).toHaveLength(1);
    expect(mapsApi.__created.polylines[0].opts.path).toEqual(routeGeometry);
  });

  // @spec MAP-001
  it("does not shortcut the route by drawing between mile markers", () => {
    const mapsApi = createFakeMapsApi();
    renderRoute(FAKE_MAP, mapsApi, routeGeometry);
    const { path } = mapsApi.__created.polylines[0].opts;
    expect(path).toHaveLength(4);
    expect(path).not.toEqual([
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
  // @spec MAP-006, MAP-019
  it("renders only the bare route while no valid input/plan is in effect, and no list rows", () => {
    const mapsApi = createFakeMapsApi();
    const container = document.createElement("div");
    const listContainer = document.createElement("div");
    renderPlan(
      FAKE_MAP,
      mapsApi,
      container,
      {
        courseRouteGeometry: [
          { mile: 0, lat: 41.87, lng: -87.67 },
          { mile: 1, lat: 41.88, lng: -87.66 },
        ],
        mileMarkerTimes: null,
        itinerary: null,
      },
      listContainer,
    );
    expect(mapsApi.__created.polylines).toHaveLength(1);
    expect(mapsApi.__created.markers).toHaveLength(0);
    expect(listContainer.querySelectorAll("li")).toHaveLength(0);
  });

  // @spec MAP-007, MAP-020, MAP-022
  it("still renders the one sparse-result stop with full styling, plus a warning message above the map and next to the list", () => {
    const mapsApi = createFakeMapsApi();
    const container = document.createElement("div");
    const listContainer = document.createElement("div");
    renderPlan(
      FAKE_MAP,
      mapsApi,
      container,
      {
        courseRouteGeometry: [{ mile: 0, lat: 41.87, lng: -87.67 }],
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
      },
      listContainer,
    );
    expect(mapsApi.__created.markers.length).toBeGreaterThanOrEqual(1);
    expect(container.textContent.toLowerCase()).toContain("no feasible multi-stop plan");
    expect(listContainer.textContent.toLowerCase()).toContain("no feasible multi-stop plan");
    expect(listContainer.querySelectorAll("li")).toHaveLength(2); // the one mile-marker row + the one stop row
  });

  // @spec MAP-010, MAP-021
  it("displays an explicit error in place of the map when the Maps API failed to load, and suppresses the list", () => {
    const mapsApi = createFakeMapsApi();
    const container = document.createElement("div");
    const listContainer = document.createElement("div");
    renderPlan(FAKE_MAP, mapsApi, container, { mapsError: "Google Maps failed to load." }, listContainer);
    expect(mapsApi.__created.polylines).toHaveLength(0);
    expect(container.textContent).toContain("Google Maps failed to load.");
    expect(listContainer.querySelectorAll("li")).toHaveLength(0);
  });

  // @spec MAP-012, MAP-021
  it("displays an explicit error in place of the map when course data failed to load, and suppresses the list", () => {
    const mapsApi = createFakeMapsApi();
    const container = document.createElement("div");
    const listContainer = document.createElement("div");
    renderPlan(FAKE_MAP, mapsApi, container, { courseError: "Course data is unavailable." }, listContainer);
    expect(mapsApi.__created.polylines).toHaveLength(0);
    expect(container.textContent).toContain("Course data is unavailable.");
    expect(listContainer.querySelectorAll("li")).toHaveLength(0);
  });

  // @spec MAP-013
  it("renders a combined chronological list with one row per mile marker plus one row per suggested stop", () => {
    const mapsApi = createFakeMapsApi();
    const container = document.createElement("div");
    const listContainer = document.createElement("div");
    renderPlan(
      FAKE_MAP,
      mapsApi,
      container,
      {
        courseRouteGeometry: [
          { mile: 0, lat: 41.87, lng: -87.67 },
          { mile: 3, lat: 41.9, lng: -87.65 },
        ],
        mileMarkerTimes: [
          { mile: 0, lat: 41.87, lng: -87.67, predictedTime: new Date("2025-10-12T07:00:00-05:00") },
          { mile: 3, lat: 41.9, lng: -87.65, predictedTime: new Date("2025-10-12T07:30:00-05:00") },
        ],
        itinerary: {
          sparse: false,
          stops: [
            {
              spot: { id: "s1", name: "Grand & State", accessNotes: "Red Line", approximatedMile: false },
              predictedTime: new Date("2025-10-12T07:15:00-05:00"),
              arrivalSlack: null,
              sequence: 1,
            },
          ],
        },
      },
      listContainer,
    );
    expect(listContainer.querySelectorAll("li")).toHaveLength(3);
  });
});

describe("buildListRows", () => {
  // @spec MAP-013
  it("sorts mile-marker rows and suggested-stop rows together by predicted clock time ascending", () => {
    const mileMarkerTimes = [
      { mile: 0, predictedTime: new Date("2025-10-12T07:00:00-05:00") },
      { mile: 3, predictedTime: new Date("2025-10-12T07:30:00-05:00") },
    ];
    const stops = [
      {
        spot: { id: "s1", name: "Grand & State" },
        predictedTime: new Date("2025-10-12T07:15:00-05:00"),
        sequence: 1,
      },
    ];
    const rows = buildListRows(mileMarkerTimes, stops);
    expect(rows.map((r) => r.kind)).toEqual(["marker", "stop", "marker"]);
  });

  // @spec MAP-017
  it("keeps a suggested stop's row and its coincident mile marker's row separate rather than merging them", () => {
    const mileMarkerTimes = [{ mile: 8, predictedTime: new Date("2025-10-12T08:00:00-05:00") }];
    const stops = [
      {
        spot: { id: "s1", name: "Broadway & Belmont" },
        predictedTime: new Date("2025-10-12T08:00:00-05:00"),
        sequence: 1,
      },
    ];
    const rows = buildListRows(mileMarkerTimes, stops);
    expect(rows).toHaveLength(2);
  });

  // @spec MAP-018
  it("lists the suggested-stop row first when it shares the exact same predicted time as a mile-marker row", () => {
    const tiedTime = new Date("2025-10-12T08:00:00-05:00");
    const mileMarkerTimes = [{ mile: 8, predictedTime: tiedTime }];
    const stops = [{ spot: { id: "s1", name: "Broadway & Belmont" }, predictedTime: tiedTime, sequence: 1 }];
    const rows = buildListRows(mileMarkerTimes, stops);
    expect(rows.map((r) => r.kind)).toEqual(["stop", "marker"]);
  });
});

describe("renderList", () => {
  // @spec MAP-014
  it("shows the mile number and predicted clock time for a mile-marker row", () => {
    const container = document.createElement("div");
    renderList(container, [{ kind: "marker", mile: 7, time: new Date("2025-10-12T08:10:00-05:00") }]);
    expect(container.textContent).toContain("Mile 7");
    expect(container.textContent).toContain("08:10");
  });

  // @spec MAP-015
  it("shows sequence, name, access notes, predicted time, and arrival slack for a suggested-stop row", () => {
    const container = document.createElement("div");
    renderList(container, [
      {
        kind: "stop",
        time: new Date("2025-10-12T08:00:00-05:00"),
        stop: {
          sequence: 2,
          arrivalSlack: 9,
          spot: { name: "Webster & Racine", accessNotes: "Brown Line", approximatedMile: false },
        },
      },
    ]);
    const text = container.textContent;
    expect(text).toContain("2");
    expect(text).toContain("Webster & Racine");
    expect(text).toContain("Brown Line");
    expect(text).toContain("08:00");
    expect(text).toContain("9");
  });

  // @spec MAP-016
  it("notes when a suggested stop's row time is approximated", () => {
    const container = document.createElement("div");
    renderList(container, [
      {
        kind: "stop",
        time: new Date("2025-10-12T08:00:00-05:00"),
        stop: {
          sequence: 1,
          arrivalSlack: 5,
          spot: { name: "Chinatown", accessNotes: "Red Line", approximatedMile: true },
        },
      },
    ]);
    expect(container.textContent.toLowerCase()).toContain("approximate");
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

describe("colour scheme", () => {
  // A fake Maps API recording every Map constructed and every setOptions call.
  function createFakeMapsApiWithMaps() {
    const maps = [];
    class Map {
      constructor(element, opts) {
        this.element = element;
        this.opts = opts;
        this.optionUpdates = [];
        maps.push(this);
      }
      setOptions(opts) {
        this.optionUpdates.push(opts);
        this.opts = { ...this.opts, ...opts };
      }
    }
    return { Map, ColorScheme: { LIGHT: "LIGHT", DARK: "DARK", FOLLOW_SYSTEM: "FOLLOW_SYSTEM" }, __maps: maps };
  }

  // @spec MAP-023
  it("styles the map for the resolved theme it is given", () => {
    const mapsApi = createFakeMapsApiWithMaps();
    createMap(mapsApi, document.createElement("div"), {
      center: { lat: 41.87, lng: -87.65 },
      zoom: 12,
      resolvedTheme: "dark",
    });
    expect(mapsApi.__maps[0].opts.styles.length).toBeGreaterThan(0);
  });

  // @spec MAP-023
  it("leaves the map unstyled in the light theme, and never uses the API's follow-the-system scheme", () => {
    const mapsApi = createFakeMapsApiWithMaps();
    createMap(mapsApi, document.createElement("div"), {
      center: { lat: 41.87, lng: -87.65 },
      zoom: 12,
      resolvedTheme: "light",
    });
    expect(mapsApi.__maps[0].opts.styles).toEqual([]);
    expect(mapsApi.__maps[0].opts.colorScheme).toBeUndefined();
  });

  // @spec MAP-024, MAP-027
  it("restyles the existing map in place, constructing no replacement", () => {
    const mapsApi = createFakeMapsApiWithMaps();
    const map = createMap(mapsApi, document.createElement("div"), {
      center: { lat: 41.87, lng: -87.65 },
      zoom: 12,
      resolvedTheme: "light",
    });
    applyThemeToMap(map, "dark");
    // The API cannot dispose of a map, so a second construction leaves the
    // first live and overlays stop attaching — exactly one map, ever.
    expect(mapsApi.__maps).toHaveLength(1);
    expect(map.optionUpdates).toHaveLength(1);
    expect(map.optionUpdates[0].styles.length).toBeGreaterThan(0);
  });

  // @spec MAP-024
  it("touches nothing but the styles, so the camera and overlays are left alone", () => {
    const mapsApi = createFakeMapsApiWithMaps();
    const map = createMap(mapsApi, document.createElement("div"), {
      center: { lat: 41.87, lng: -87.65 },
      zoom: 12,
      resolvedTheme: "dark",
    });
    applyThemeToMap(map, "light");
    expect(Object.keys(map.optionUpdates[0])).toEqual(["styles"]);
    expect(map.opts.center).toEqual({ lat: 41.87, lng: -87.65 });
    expect(map.opts.zoom).toBe(12);
  });

  // @spec MAP-025
  it("takes no map action when the theme changes while no map exists", () => {
    expect(() => applyThemeToMap(null, "dark")).not.toThrow();
    expect(applyThemeToMap(null, "dark")).toBe(false);
  });
});
