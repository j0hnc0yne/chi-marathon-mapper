---
parent: high-level-design
prefix: PACE
---

# Pace Predictor

## Context and Design Philosophy

Translates a spectator's two inputs — the runner's start time and average per-mile pace — into an estimated clock time at each point along the course. This is a pure, deterministic transform: given the same start time, pace, and course data, it always produces the same predicted times. It has no knowledge of the UI, the map, or viewing spots; other components (map display, itinerary suggester) call it and consume its output.

## Model

Predicted time at a course point is a linear function of course distance:

```
predictedTime(mile) = raceStart + (mile * paceMinutesPerMile)
```

`raceStart` is a full timestamp, not a bare clock time: because the project is hard-scoped to the 2025 Chicago Marathon (a single known calendar date), the race date is a fixed constant paired with course data, and the spectator's entered start time is combined with that fixed date to produce an unambiguous timestamp. The spectator enters the runner's actual start-line crossing time directly (gun or chip time, whichever they know) — there is no wave-start lookup or corral logic.

Pace is constant across the whole course. The model does not account for negative splits, fatigue, hills, or aid-station stops — per the HLD's "a plausible plan beats a precise one" tenet, this is a deliberate simplification.

## Interface

**Input:** `raceStart` (timestamp), `paceMinutesPerMile` (number), a list of course points from course data. A point's distance is read from `mile` for a mile marker or `nearestMile` for a viewing spot — the field read depends on which record type is passed, matching course data's own schema rather than requiring a normalized field invented solely for this component.

**Output:** the same list of points, each annotated with a `predictedTime` timestamp.

This function trusts its inputs: `paceMinutesPerMile` is assumed to already be validated (see input-state's 4:30–15:00 min/mile range) by the time it reaches here, and a non-empty point list is assumed to reflect correctly-loaded course data. An empty point list is treated as an error — it indicates course data failed to load, not a legitimate case to handle quietly. Points beyond the course's nominal 26.2-mile length are computed and returned without special-casing; no real course point exceeds that distance, so guarding against it would be speculative.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| Pace model | Single constant pace for the whole course | Per-segment or negative-split pacing | Matches the single pace input described for the tool and the HLD's simplicity tenet; real pace variance is treated as noise the plan doesn't need to model. |
| Race date | Fixed constant tied to course data, not user-entered | Let the spectator pick a date | v1 is hard-scoped to one race on one known date (HLD Non-Goals); asking for a date the tool already knows would be a needless input. |
| Start time semantics | The runner's actual start-line crossing time, entered directly | Look up start time from a wave/corral assignment | Avoids modeling Chicago Marathon's wave-start structure entirely; the spectator is assumed to know or estimate when their runner actually started. |
| Output granularity | Mirrors whatever points it's given (no independent resampling) | Predictor generates its own fixed set of points | Keeps this component a thin, dependent transform — course data owns which points exist, this component only owns timing math. |
| Field read for a point's distance | `nearestMile` for viewing spots, `mile` for course markers | A single normalized `mile` field required on every input type | Matches course data's actual schema instead of inventing a normalization step this component doesn't otherwise need. |
| Pace validity guarding | Assumed already validated by input-state before reaching this function | Re-validate defensively inside the predictor | Validation is owned by input-state, the only place pace originates from user input; this component stays a pure, trusting transform. |
| Empty input point list | Treated as an error | Return an empty result silently | An empty list means course data failed to load correctly upstream — surfacing it as an error rather than quietly returning nothing. |
| Points beyond the course's max distance | Computed and returned without special-casing | Clamp or reject | No real course point exceeds 26.2 miles; guarding against a case that can't occur under normal data would be speculative. |

## Open Questions & Future Decisions

### Deferred
1. None currently — the model is fully specified by the decisions above.

## References

- `docs/intent/course-data/course-data-design.md` — source of the course points this component annotates.
