# Pace Predictor — EARS Specs

## Prediction Model

- [x] **PACE-001**: Given a race start timestamp, a per-mile pace, and a course point carrying a distance in miles, the system shall compute the predicted clock time at that point as the start timestamp plus (distance × pace).
- [x] **PACE-002**: The system shall apply a single constant pace across the entire course when computing predicted times, with no per-segment or negative-split modeling.
- [x] **PACE-004**: The race date used to compute predicted timestamps shall be a fixed constant tied to the 2026 Chicago Marathon course data, not a spectator-entered value.
- [x] **PACE-005**: The start time used in prediction shall be the runner's actual start-line crossing time as entered by the spectator (input-state's `start` value), with no wave or corral lookup applied.

## Input Handling

- [x] **PACE-003**: When computing the predicted time for a viewing spot, the system shall read its distance from the spot's `nearestMile` field; when computing the predicted time for a mile marker, the system shall read its distance from the marker's `mile` field.
- [x] **PACE-006**: The system shall assume the pace value it receives has already been validated to the 4:30–15:00 minutes-per-mile range (see INPUT-004) and shall not re-validate it.
- [x] **PACE-007**: If the list of course points given to the predictor is empty, then the system shall treat this as an error rather than returning an empty result silently.
- [x] **PACE-008**: The system shall compute and return a predicted time for course points beyond 26.2 miles without special-casing or clamping them.
