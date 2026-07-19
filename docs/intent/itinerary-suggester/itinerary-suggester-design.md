---
parent: high-level-design
prefix: ITIN
---

# Itinerary Suggester

## Context and Design Philosophy

Turns predicted passage times at curated viewing spots into a short, ordered list of spots a spectator can actually reach in sequence before the runner arrives at each one. This is the component that answers the HLD's motivating question — "where should I stand, and when do I need to leave for the next spot?" It is a pure computation over course data, the travel-time matrix, and pace-predictor's output; it owns no I/O of its own.

## Feasibility Model

For a candidate move from a previously-chosen spot A (predicted passage time `tA`) to a later spot B (predicted passage time `tB`), the move is feasible if the spectator can leave A after the runner passes and still arrive at B with slack to spare:

```
arrivalSlack(A, B) = (tB - travelTime(A, B)) - tA
```

A move is feasible when `arrivalSlack >= MIN_SLACK_MINUTES`, a fixed buffer (default 5 minutes) that hedges against real-world pace variance the constant-pace model doesn't capture. `travelTime(A, B)` is the faster of the walking and transit estimates in the travel-time matrix for that pair, since both are already static point-estimates and the itinerary favors whichever gets the spectator there sooner. When the matrix only carries one of the two modes for a pair, whichever mode is present is used as-is. When the matrix has no entry at all for a pair the scan needs, that hop is treated as infeasible and the scan simply moves on to the next candidate — a missing entry reflects a gap in the hand-curated data set, not a runtime fault worth erroring over.

A candidate pair with `tB < tA` (an out-of-course-order passage time, which shouldn't occur under valid course-ordered data and monotonic pace math) needs no special-casing: the feasibility formula naturally produces a negative slack, which already fails the `MIN_SLACK_MINUTES` threshold.

Course data's own contract guarantees a real travel-time matrix entry for every curated pair (see course data's Data Integrity section) — a missing entry is not expected to occur in practice. Treating it as infeasible-and-skip rather than raising an error is defensive redundancy, not an assumption that course data's guarantee will routinely fail: it costs nothing when the guarantee holds, and degrades gracefully rather than crashing the whole itinerary computation on the rare occasion it doesn't.

## Selection Algorithm

Spots are considered in course order (by `nearestMile`); spots that share the same `nearestMile` are ordered alphabetically by name, a deterministic tie-break that doesn't depend on curation-list ordering carrying meaning. The itinerary always anchors on the first curated spot in that course order — it is included unconditionally, with no feasibility check, since reaching the first spot is a matter of the spectator positioning themselves before the race starts rather than a travel-time constraint the model needs to evaluate. From there, the suggester scans forward and greedily keeps a spot if the move from the last-kept spot is feasible, skipping spots it can't feasibly reach. This is a local, greedy choice rather than a globally-optimal search (e.g. dynamic programming to maximize the number of spots visited) — per the HLD's "plausible plan beats a precise one" tenet, a simple, explainable sequence is preferred over a maximal one that might be fragile to real-world variance.

## Output

An ordered list of stops, each carrying the spot, its predicted passage time, the travel time from the previous stop, and the computed arrival slack — enough for the UI to render something like "Mile 3 (Clark & Eugenie) → 14 min transit → Mile 7 (Webster), arrive 9 min early."

The list can come out empty or hold only a single stop — an unusually fast or slow pace can outrun the spacing of the curated spot set. The suggester does not force a minimum number of stops or fabricate a plan that isn't actually feasible; it returns whatever it finds and flags a sparse result (zero or one stop) so map display can surface an explicit warning rather than presenting a thin result as if it were a complete plan.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| Selection strategy | Greedy forward scan, keep first feasible next spot | Dynamic programming to maximize spot count | Simpler and more predictable; matches the HLD's preference for a plausible plan over a maximal/precise one. |
| Feasibility buffer | Fixed minimum arrival slack (default 5 minutes) rather than zero-slack feasibility | No buffer; slack proportional to elapsed race time | Hedges against real pace variance without explicitly modeling variance; a flat buffer is simple to reason about and explain to the spectator. |
| Travel mode per hop | Use the faster of walking/transit from the matrix; use whichever mode is present if only one exists | Always prefer walking; always prefer transit; require both modes present | Both are already static estimates for that specific pair; taking the faster available one maximizes feasibility without adding runtime complexity. |
| Missing matrix entry for a needed pair | Treated as infeasible; scan continues to the next candidate | Raise an error; assume a default fallback travel time | Missing entries reflect a hand-curated dataset gap, not a runtime fault — treating the hop as infeasible degrades gracefully without guessing at a travel time. |
| Spots sharing the same `nearestMile` | Ordered alphabetically by name | Ordered by curation/insertion order | Alphabetical is deterministic and doesn't depend on curation-list ordering being meaningful. |
| Passage times out of course order (`tB < tA`) between two candidates | No special-casing — the existing slack formula already fails the feasibility threshold | Treat as a data-integrity error | This shouldn't occur under valid data, and the existing formula already handles it correctly if it somehow does. |
| Zero or one feasible stop for a given pace | Return whatever is feasible (possibly empty or a single stop); flag the result as sparse | Always force at least one suggested stop; return nothing at all with no signal | Lets map display surface an explicit warning rather than hiding the degenerate case or fabricating a plan that isn't actually feasible. |
| Itinerary start anchor | Always the first curated spot in course order, included unconditionally | A spot the spectator selects as their own starting point | Reaching the first spot is positioning before the race starts, not a travel-time constraint; anchoring on it avoids a second input the spectator would otherwise have to make. |

## Open Questions & Future Decisions

### Deferred
1. Exact default value for `MIN_SLACK_MINUTES` and whether it should be spectator-adjustable.

## References

- `docs/intent/course-data/course-data-design.md` — source of viewing spots and the travel-time matrix.
- `docs/intent/pace-predictor/pace-predictor-design.md` — source of predicted passage times.
