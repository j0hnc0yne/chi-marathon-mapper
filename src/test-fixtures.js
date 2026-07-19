// Synthetic course data shared by the pure-function unit tests. Not real
// Chicago Marathon coordinates — geometry is fictional but internally
// consistent (increasing mile values), sized for readable test cases rather
// than production coverage.

export function makeFullCourseMileMarkers() {
  const markers = [];
  for (let mile = 0; mile <= 26; mile += 1) {
    markers.push({ mile, lat: 41.8 + mile * 0.001, lng: -87.7 + mile * 0.001 });
  }
  markers.push({ mile: 26.2, lat: 41.826, lng: -87.674 });
  return markers;
}

export const sparseMileMarkers = [
  { mile: 0, lat: 41.871, lng: -87.671 },
  { mile: 3, lat: 41.912, lng: -87.638 },
  { mile: 7, lat: 41.921, lng: -87.652 },
  { mile: 10, lat: 41.926, lng: -87.665 },
  { mile: 14, lat: 41.938, lng: -87.677 },
  { mile: 26.2, lat: 41.88, lng: -87.624 },
];

export const viewingSpots = [
  { id: "spot-mile3", name: "Clark & Eugenie", lat: 41.912, lng: -87.638, nearestMile: 3, accessNotes: "Red Line" },
  { id: "spot-mile7", name: "Webster & Racine", lat: 41.921, lng: -87.652, nearestMile: 7, accessNotes: "Brown Line" },
  { id: "spot-mile10", name: "Damen & Wolcott", lat: 41.926, lng: -87.665, nearestMile: 10, accessNotes: "Blue Line" },
  { id: "spot-mile14", name: "Adams & Ashland", lat: 41.938, lng: -87.677, nearestMile: 14, accessNotes: "Pink Line" },
];

// Full pairwise, both directions, matching every ordered pair in `viewingSpots`.
export const travelTimeMatrix = [
  { from: "spot-mile3", to: "spot-mile7", walkMinutes: 42, transitMinutes: 14 },
  { from: "spot-mile7", to: "spot-mile3", walkMinutes: 42, transitMinutes: 16 },
  { from: "spot-mile3", to: "spot-mile10", walkMinutes: 70, transitMinutes: 22 },
  { from: "spot-mile10", to: "spot-mile3", walkMinutes: 70, transitMinutes: 24 },
  { from: "spot-mile3", to: "spot-mile14", walkMinutes: 95, transitMinutes: 30 },
  { from: "spot-mile14", to: "spot-mile3", walkMinutes: 95, transitMinutes: 31 },
  { from: "spot-mile7", to: "spot-mile10", walkMinutes: 28, transitMinutes: 12 },
  { from: "spot-mile10", to: "spot-mile7", walkMinutes: 28, transitMinutes: 13 },
  { from: "spot-mile7", to: "spot-mile14", walkMinutes: 50, transitMinutes: 18 },
  { from: "spot-mile14", to: "spot-mile7", walkMinutes: 50, transitMinutes: 19 },
  { from: "spot-mile10", to: "spot-mile14", walkMinutes: 25, transitMinutes: 10 },
  { from: "spot-mile14", to: "spot-mile10", walkMinutes: 25, transitMinutes: 11 },
];
