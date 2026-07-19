# Map Display — EARS Specs

## Course and Marker Rendering

- [x] **MAP-001**: The system shall render the course as a polyline connecting course data's mile markers.
- [x] **MAP-002**: The system shall place a marker at each mile marker point.
- [x] **MAP-003**: When a mile marker is hovered or clicked, the system shall display its predicted clock time in an info window rather than as an always-on label.
- [x] **MAP-004**: The system shall render the itinerary suggester's chosen stops with a marker style visually distinct from plain mile markers.
- [x] **MAP-005**: When a suggested stop's info window is opened, the system shall display its predicted clock time, sequence number, and computed arrival slack; if the stop's underlying viewing spot is flagged `approximatedMile` (COURSE-009), the info window shall also note that the shown time is approximate.

## State Rendering

- [x] **MAP-006**: While no valid start time and pace are currently in effect — whether because none has been entered, or because input state is showing a partial/malformed-link error (INPUT-007) — the system shall render only the bare course route with no predicted times and no suggested stops.
- [x] **MAP-007**: While valid inputs produce zero or one feasible suggested stop (itinerary suggester's sparse result, ITIN-008), the system shall render the route and mile-marker times as usual, shall still render any single stop present with the same marker style and info window content specified in MAP-004/MAP-005, and shall add a warning message that no feasible multi-stop plan was found.
- [x] **MAP-012**: If course data fails to load or validate (COURSE-007 or COURSE-008), then the system shall display an explicit error in place of the map rather than rendering an empty or partial route.

## Overlap and Click Handling

- [x] **MAP-008**: When a suggested stop's coordinates coincide with or sit very close to a plain mile marker's coordinates, the system shall draw both markers stacked rather than suppressing either.
- [x] **MAP-009**: When two markers are close enough that a click could target either, the system shall resolve which info window opens via an explicit priority order, with suggested stops taking priority over plain mile markers.

## Google Maps Integration

- [x] **MAP-010**: If the Google Maps JavaScript API fails to load, then the system shall display an explicit error rather than an unexplained blank map area.
- [x] **MAP-011**: The system shall load the Google Maps JavaScript API using a client-side API key restricted by HTTP referrer to the GitHub Pages origin.
