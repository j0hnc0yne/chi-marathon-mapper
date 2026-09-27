# Course Data — EARS Specs

## Route Geometry

- [x] **COURSE-011**: The system shall represent the course route as an ordered list of points, each carrying a latitude and a longitude and no distance value.
- [x] **COURSE-012**: The route geometry shall be ordered in course order, with its first point at the start line and its last point at the finish line.
- [x] **COURSE-013**: Wherever distance along the course route is computed, the system shall compute it as the sum of great-circle distances between consecutive route geometry points.
- [x] **COURSE-014**: If route geometry is missing, is not a list, contains fewer than two points, or contains a point whose latitude or longitude is not a finite number, then the system shall treat the course data as invalid and display an error.

## Mile Markers

- [x] **COURSE-001**: The system shall represent labelled distances along the course as an ordered list of mile markers, each carrying a cumulative course distance in miles and a latitude/longitude coordinate.
- [x] **COURSE-002**: The mile marker list shall cover at minimum every full mile from 0 through 26, plus the finish at mile 26.2.
- [x] **COURSE-015**: Each mile marker's coordinates shall lie on the route geometry at the point reached by travelling its mile value of cumulative distance along the route from the start line.

## Viewing Spots and Travel Times

- [x] **COURSE-003**: The system shall represent a curated set of viewing spots, each carrying an id, a name, coordinates, a nearest-mile value, and access notes.
- [x] **COURSE-004**: The system shall represent travel times between viewing spots as a matrix with an explicit entry for each ordered pair of spots (both directions stored independently, not assumed symmetric).
- [x] **COURSE-005**: Each travel-time matrix entry shall record a walking-minutes value and, where available, a transit-minutes value.
- [x] **COURSE-006**: The travel-time matrix shall not include driving times between viewing spots.
- [x] **COURSE-010**: Where a curated pair of viewing spots is separated by a physical barrier (the river or rail lines), the travel-time matrix shall still carry a real entry reflecting a route around the barrier, rather than an "unreachable" placeholder.

## Data Integrity

- [x] **COURSE-007**: If a course data file fails to parse, or a record is missing a required field, then the system shall display an error rather than proceeding with the load.
- [x] **COURSE-008**: If two mile markers share the same mile value, or the mile marker list is not strictly increasing by mile, then the system shall treat the course data as invalid and display an error.
- [x] **COURSE-009**: When a viewing spot's nearest-mile value does not exactly match an existing mile marker's distance, the system shall resolve it to the closest available mile marker by distance and flag the spot as using an approximated mile.

## Curation: Extraction From the Official Course Map

- [x] **COURSE-016**: The course extraction shall derive route geometry, mile-marker positions, and viewing-spot nearest-mile anchors from the official course map PDF, writing them in a single run.
- [x] **COURSE-017**: The course extraction shall identify the course within the PDF by its drawing style; if zero or more than one drawn path matches that style, the extraction shall abort without writing output.
- [x] **COURSE-018**: The course extraction shall solve the page-to-coordinate scale from the certified race distance of 26.2 miles, and the page-to-coordinate offset from street-label control points, treating the map projection as conformal and unrotated.
- [x] **COURSE-019**: The course extraction shall emit a mile marker at mile 0, at each full mile through mile 26, and at the finish at mile 26.2.
- [x] **COURSE-020**: The course extraction shall interpolate each mile marker's coordinates along the route segment containing that marker's cumulative distance, rather than snapping the marker to the nearest route vertex.
- [x] **COURSE-021**: The course extraction shall match every mile from 1 through 26 to a number printed on the course map, identifying which printed number labels which mile by its position along the route; if any mile cannot be matched, or a matched label lies more than 2,000 ft from the position computed for that mile, then the extraction shall abort without writing output.
- [x] **COURSE-031**: The course extraction shall establish course order by orienting the extracted path so its endpoints match the course's known start and finish locations, rather than relying on the order the path is drawn in.
- [x] **COURSE-022**: If, in either orientation, the first or last point of the extracted route geometry lies more than 300 ft from the course's known start or finish location respectively, then the extraction shall abort without writing output.
- [x] **COURSE-023**: If any street-label control point's fitted coordinate differs from that street's known coordinate by more than 1,000 ft, then the extraction shall abort without writing output.
- [x] **COURSE-024**: When the course extraction aborts at any validation gate, it shall leave the existing course data file unchanged.
- [x] **COURSE-027**: The course extraction shall set each viewing spot's nearest-mile value to the cumulative distance of the earliest point at which the route passes within 500 ft of that spot.
- [x] **COURSE-028**: If the route does not pass within 500 ft of a curated viewing spot, then the course extraction shall abort without writing output.
- [x] **COURSE-029**: The course extraction shall preserve each viewing spot's hand-curated name, coordinates and access notes, and the travel-time matrix, unchanged.
- [x] **COURSE-030**: Continuous integration shall re-run the course extraction and fail if its output differs from the committed course data file.
- [x] **COURSE-025**: The course extraction shall record in the generated data file a provenance entry naming the source course map PDF and what was generated from it.
- [x] **COURSE-026**: The absence of a provenance entry in the course data file shall not cause the course data to be treated as invalid.
