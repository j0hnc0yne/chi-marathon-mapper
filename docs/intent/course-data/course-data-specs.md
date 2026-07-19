# Course Data — EARS Specs

## Course Geometry

- [x] **COURSE-001**: The system shall represent the course as an ordered list of mile markers, each carrying a cumulative course distance in miles and a latitude/longitude coordinate.
- [x] **COURSE-002**: The mile marker list shall cover at minimum every full mile from 0 through 26, plus the finish at mile 26.2.

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
