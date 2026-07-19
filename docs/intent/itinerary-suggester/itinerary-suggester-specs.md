# Itinerary Suggester — EARS Specs

## Feasibility Model

- [x] **ITIN-001**: Given predicted passage times for two curated viewing spots A (earlier) and B (later) and the travel time between them, the system shall compute the arrival slack for the move from A to B as (predicted time at B − travel time from A to B) − predicted time at A.
- [x] **ITIN-002**: The system shall consider a move from spot A to spot B feasible only when the computed arrival slack is at least the minimum slack buffer (5 minutes by default).
- [x] **ITIN-003**: When computing the travel time between two spots, the system shall use the faster of the walking and transit estimates when the travel-time matrix has both, and shall use whichever single estimate is present when the matrix has only one.
- [x] **ITIN-004**: If the travel-time matrix has no entry at all for a pair of spots the selection scan needs, then the system shall treat that move as infeasible and continue scanning rather than raising an error.

## Selection

- [x] **ITIN-005**: The system shall consider curated viewing spots in course order by nearest-mile value, breaking ties between spots sharing the same nearest-mile value alphabetically by name.
- [x] **ITIN-006**: The system shall select the suggested itinerary via a greedy forward scan, keeping the first feasible next spot encountered from the last-kept spot rather than searching for a maximal or globally optimal sequence.
- [x] **ITIN-009**: The system shall always include the first curated spot in course order as the first stop, unconditionally and without a feasibility check.

## Output

- [x] **ITIN-007**: The system shall return an ordered list of suggested stops, each carrying the spot, its predicted passage time, the travel time from the previous stop, and the computed arrival slack.
- [x] **ITIN-008**: While the computed suggested-stop list contains zero or one stop, the system shall flag the result as sparse so that map display (MAP-007) can surface an explicit warning.
