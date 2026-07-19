# Input State — EARS Specs

## Fields

- [x] **INPUT-001**: The system shall capture the runner's start time via a native time input control.
- [x] **INPUT-002**: The system shall interpret the entered start time as Chicago race-day local time, regardless of the spectator's device timezone.
- [x] **INPUT-003**: The system shall capture the runner's average pace as an `MM:SS`-per-mile value.
- [x] **INPUT-004**: If the entered pace is outside the 4:30–15:00 minutes-per-mile range, or is not a well-formed `MM:SS` value (including a seconds component of 60 or greater), then the system shall display a validation error and shall not compute predictions.

## URL Synchronization — Load

- [x] **INPUT-005**: When the page loads with no `start` or `pace` query parameters present, the system shall show an empty form with no error.
- [x] **INPUT-006**: When the page loads with both a valid `start` and a valid `pace` query parameter, the system shall pre-populate the form and compute predictions immediately.
- [x] **INPUT-007**: If the page loads with exactly one of the `start`/`pace` query parameters present and valid while the other is missing or malformed, then the system shall display an explicit error distinct from the empty-form state (INPUT-005).

## URL Synchronization — Form Changes

- [x] **INPUT-008**: When the spectator changes the start time or pace to a valid value, the system shall update the URL's query string via `history.replaceState` to reflect the current form state.
- [x] **INPUT-009**: While a field's current entry is not yet a valid value, the system shall leave the URL unchanged at its last valid value.
- [x] **INPUT-010**: When a previously valid field is cleared back to empty, the system shall immediately remove the corresponding parameter from the URL.
- [x] **INPUT-011**: The system shall use `history.replaceState` rather than `history.pushState` when updating the URL from form changes, so that editing inputs does not add entries to browser back-button history.

## Recompute Pipeline

- [x] **INPUT-012**: When the form's start time and pace are both currently valid — whether that validity was reached via page load (INPUT-006) or a subsequent edit (INPUT-008) — the system shall invoke pace-predictor, then itinerary-suggester, then map-display, in that order, to refresh the displayed plan.
