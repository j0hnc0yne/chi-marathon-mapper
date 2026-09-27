export class MapsLoadError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "MapsLoadError";
  }
}

// @spec MAP-011
export function buildMapsScriptUrl(apiKey) {
  return `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
}

// @spec MAP-010
export async function loadMapsApi(scriptLoader) {
  try {
    return await scriptLoader();
  } catch (cause) {
    throw new MapsLoadError("Google Maps failed to load", { cause });
  }
}

// The Maps API accepts a colour scheme only when a map is constructed, so the
// resolved theme is a construction argument and a theme change means a new map.
// Its own FOLLOW_SYSTEM would honour the OS and ignore a pin, which is exactly
// the case a pin exists for.
// The map's dark palette. Separate from the CSS tokens because the map is
// styled through the Maps API rather than by the stylesheet — see the
// map-display design doc's open question about deriving one from the other.
const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#212121" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#757575" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#181818" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2c2c2c" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#373737" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3c3c3c" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f2f2f" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#000000" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3d3d3d" }] },
];

function mapStyleFor(resolvedTheme) {
  return resolvedTheme === "dark" ? DARK_MAP_STYLE : [];
}

// The Maps API's own colour-scheme option is construction-only, and the API
// cannot dispose of a map — so honouring a theme change through it would mean
// building a second map beside a live first one, which stops overlays
// attaching. A palette applied in place needs only one map, ever.
// @spec MAP-023, MAP-027
export function createMap(mapsApi, container, { center, zoom, resolvedTheme }) {
  return new mapsApi.Map(container, {
    center,
    zoom,
    mapTypeControl: false,
    streetViewControl: false,
    styles: mapStyleFor(resolvedTheme),
  });
}

/**
 * Repaints the live map for a new theme. Only the styles are touched, so the
 * camera, the route, the markers and their info windows all stay as they are.
 * Returns false when there is no map — the Maps API or course data may have
 * failed to load, and the theme control keeps working on those pages by design.
 *
 * @spec MAP-024, MAP-025
 */
export function applyThemeToMap(map, resolvedTheme) {
  if (!map) return false;
  map.setOptions({ styles: mapStyleFor(resolvedTheme) });
  return true;
}

function formatChicagoTime(date) {
  return date.toLocaleTimeString("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const SUGGESTED_STOP_ICON = {
  path: "M 0,-2 L 1.8,1.5 L -1.8,1.5 Z",
  scale: 7,
  fillColor: "#d32f2f",
  fillOpacity: 1,
  strokeColor: "#ffffff",
  strokeWeight: 1.5,
};

// Drawn from the course's route geometry, not from the mile markers: markers
// are a third of a mile apart, so a line through them cuts across city blocks,
// the river and Lincoln Park.
// @spec MAP-001
export function renderRoute(map, mapsApi, routeGeometry) {
  return new mapsApi.Polyline({
    map,
    path: routeGeometry.map((point) => ({ lat: point.lat, lng: point.lng })),
    strokeColor: "#1a73e8",
    strokeWeight: 4,
  });
}

// @spec MAP-002, MAP-003
export function renderMileMarkers(map, mapsApi, points) {
  return points.map((point) => {
    const marker = new mapsApi.Marker({
      map,
      position: { lat: point.lat, lng: point.lng },
      title: `Mile ${point.mile}`,
    });
    const infoWindow = new mapsApi.InfoWindow({
      content: `<strong>Mile ${point.mile}</strong> — runner expected at ${formatChicagoTime(point.predictedTime)}`,
    });
    const record = { kind: "plain", marker, infoWindow, lat: point.lat, lng: point.lng };
    marker.addListener("click", () => infoWindow.open({ map, anchor: marker }));
    return record;
  });
}

// @spec MAP-004, MAP-005
export function renderSuggestedStops(map, mapsApi, stops) {
  return stops.map((stop) => {
    const marker = new mapsApi.Marker({
      map,
      position: { lat: stop.spot.lat, lng: stop.spot.lng },
      title: `Stop ${stop.sequence}: ${stop.spot.name}`,
      icon: SUGGESTED_STOP_ICON,
      zIndex: 100,
    });
    const lines = [
      `<strong>Stop ${stop.sequence}: ${stop.spot.name}</strong>`,
      `Runner expected at ${formatChicagoTime(stop.predictedTime)}`,
    ];
    if (typeof stop.arrivalSlack === "number") {
      lines.push(`Arrive about ${Math.round(stop.arrivalSlack)} min before the runner`);
    }
    if (stop.spot.approximatedMile) {
      lines.push("Time is approximate — this spot sits between mile markers");
    }
    const infoWindow = new mapsApi.InfoWindow({ content: lines.join("<br>") });
    const record = { kind: "suggested", marker, infoWindow, lat: stop.spot.lat, lng: stop.spot.lng };
    marker.addListener("click", () => infoWindow.open({ map, anchor: marker }));
    return record;
  });
}

// @spec MAP-009
export function resolveClickPriority(candidateRecords) {
  return candidateRecords.find((r) => r.kind === "suggested") ?? candidateRecords[0];
}

function showMessage(container, text, kind) {
  const el = document.createElement("p");
  el.className = `map-message map-message-${kind}`;
  el.textContent = text;
  container.appendChild(el);
}

const SPARSE_WARNING_TEXT =
  "No feasible multi-stop plan was found for this pace — the runner outruns the travel time between viewing spots.";

// @spec MAP-013, MAP-017, MAP-018
export function buildListRows(mileMarkerTimes, stops) {
  const rows = [
    ...mileMarkerTimes.map((marker) => ({ kind: "marker", mile: marker.mile, time: marker.predictedTime })),
    ...stops.map((stop) => ({ kind: "stop", time: stop.predictedTime, stop })),
  ];
  rows.sort((a, b) => {
    const diff = a.time.getTime() - b.time.getTime();
    if (diff !== 0) return diff;
    if (a.kind === b.kind) return 0;
    return a.kind === "stop" ? -1 : 1;
  });
  return rows;
}

// @spec MAP-014, MAP-015, MAP-016
export function renderList(container, rows) {
  const list = document.createElement("ol");
  list.className = "itinerary-list";
  for (const row of rows) {
    const li = document.createElement("li");
    if (row.kind === "marker") {
      li.className = "itinerary-list-marker";
      li.textContent = `Mile ${row.mile} — ${formatChicagoTime(row.time)}`;
    } else {
      li.className = "itinerary-list-stop";
      const parts = [`Stop ${row.stop.sequence}: ${row.stop.spot.name}`];
      if (row.stop.spot.accessNotes) parts.push(row.stop.spot.accessNotes);
      parts.push(`runner expected at ${formatChicagoTime(row.time)}`);
      if (typeof row.stop.arrivalSlack === "number") {
        parts.push(`arrive about ${Math.round(row.stop.arrivalSlack)} min before the runner`);
      }
      if (row.stop.spot.approximatedMile) {
        parts.push("time is approximate — this spot sits between mile markers");
      }
      li.textContent = parts.join(" — ");
    }
    list.appendChild(li);
  }
  container.appendChild(list);
}

// @spec MAP-006, MAP-007, MAP-010, MAP-012, MAP-013, MAP-019, MAP-020, MAP-021, MAP-022
export function renderPlan(map, mapsApi, messageContainer, state, listContainer) {
  messageContainer.replaceChildren();
  listContainer?.replaceChildren();

  if (state.mapsError) {
    showMessage(messageContainer, state.mapsError, "error");
    return { route: null, markerRecords: [] };
  }
  if (state.courseError) {
    showMessage(messageContainer, state.courseError, "error");
    return { route: null, markerRecords: [] };
  }

  const route = renderRoute(map, mapsApi, state.courseRouteGeometry);
  const markerRecords = [];

  if (!state.mileMarkerTimes) {
    return { route, markerRecords };
  }

  markerRecords.push(...renderMileMarkers(map, mapsApi, state.mileMarkerTimes));

  if (state.itinerary) {
    markerRecords.push(...renderSuggestedStops(map, mapsApi, state.itinerary.stops));
    if (state.itinerary.sparse) {
      showMessage(messageContainer, SPARSE_WARNING_TEXT, "warning");
      if (listContainer) showMessage(listContainer, SPARSE_WARNING_TEXT, "warning");
    }
  }

  if (listContainer) {
    renderList(listContainer, buildListRows(state.mileMarkerTimes, state.itinerary?.stops ?? []));
  }

  return { route, markerRecords };
}
