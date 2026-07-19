---
parent: high-level-design
prefix: COURSE
---

# Course Data

## Context and Design Philosophy

Every other component (pace prediction, itinerary suggestion, map display) depends on a shared, static description of the 2025 Bank of America Chicago Marathon course: where the course physically runs, which points along it are good places for a spectator to stand, and how long it takes to move between those points. This component owns that data contract. It is data, not behavior — there is no runtime logic here beyond loading and validating the shape of static files checked into the repo.

## Data Sets

**Mile markers.** An ordered list of points along the course, each carrying the cumulative course distance (in miles, not straight-line distance) and its coordinates:

```json
{ "mile": 3.0, "lat": 41.xxxx, "lng": -87.xxxx }
```

Covers at minimum every full mile (0 through 26) plus the finish (26.2).

**Viewing spots.** A curated list of spectator-accessible points along or near the course, each anchored to its nearest mile marker:

```json
{
  "id": "spot-mile3-clark",
  "name": "Clark & Eugenie",
  "lat": 41.xxxx, "lng": -87.xxxx,
  "nearestMile": 3.0,
  "accessNotes": "Red Line to North/Clybourn, 5 min walk"
}
```

Not every mile marker has a corresponding viewing spot — this list is a deliberately small, hand-picked subset chosen for spectator accessibility (transit proximity, sightlines, room to stand), not course coverage.

**Travel-time matrix.** Precomputed, one-time-computed travel times between every pair of curated viewing spots, covering both walking and transit:

```json
{ "from": "spot-mile3-clark", "to": "spot-mile7-webster", "walkMinutes": 42, "transitMinutes": 14 }
```

Driving is not included: the course footprint has active street closures for vehicle traffic during race hours, so driving between spots is not a realistic option on race day itself.

The travel-time matrix stores an explicit entry for each direction of a pair (`A→B` and `B→A` separately) rather than assuming symmetry — real walking and transit routes aren't always identical in both directions (one-way streets, station entrances on one side of a road).

## Data Integrity

The three data sets are curated once, offline, and are expected to already be internally consistent by the time they ship. The app does not attempt to repair bad data at runtime:

- A file that fails to parse, or a record missing a required field, is treated as invalid data — the app displays an error rather than proceeding with a partial or guessed-at data set.
- Mile markers with duplicate or non-monotonic `mile` values are a curation bug, not a case the app is designed to tolerate; they fall under the same invalid-data error path.
- When a viewing spot's `nearestMile` doesn't exactly match an existing mile-marker entry, it resolves to the closest available marker by distance, and that resolution is flagged (e.g. an `approximatedMile: true` note on the spot) so downstream consumers can indicate to the spectator that the shown time is approximate.
- Every curated pair in the travel-time matrix is expected to have a real, findable route — curation routes around physical barriers (the river, rail lines) rather than leaving a pair disconnected. There is no "unreachable" sentinel value; connectivity is guaranteed at curation time, not handled as a runtime case.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| Data format | Static JSON files checked into the repo | CSV; data embedded as JS constants | JSON is fetchable without a build step, keeps data cleanly separated from behavior code, and is easy to hand-audit against the official course map. |
| Curation method | Manual, one-time transcription from the official course map | Automated geocoding from an official GPX/KML | No confirmed machine-readable course geometry source exists; manual curation from the published map is the only available source. |
| Travel-time matrix shape | Full pairwise matrix (every curated spot to every other, both directions) | Only adjacent-spot pairs; computed on demand at runtime; assume direction-symmetric times | The curated spot set is small (on the order of a dozen), so a full pairwise matrix is cheap to precompute once; storing both directions avoids a false symmetry assumption. |
| Modes in travel-time matrix | Walking and transit only | Also include driving | Race-day street closures make driving between spots unrealistic during the window it would matter. |
| Data integrity failures (parse error, missing field, duplicate/non-monotonic mile values) | Treated as invalid data; the app displays an error | Silently skip bad records; attempt best-effort repair | Bad static data is a curation bug, not a runtime condition to design around — surfacing it loudly catches curation mistakes immediately rather than masking them. |
| Viewing spot's `nearestMile` not exactly matching a marker | Snap to the closest available mile marker, flagged as approximated | Require exact match at curation time; interpolate a synthetic marker | Keeps the marker set a fixed, curated list while still letting spots reference any point on the course; the approximation is small and worth flagging rather than forbidding. |
| Spot pairs separated by a physical barrier (river, rail) | Curation finds a real route around the barrier; every curated pair has a real entry | An explicit "unreachable" sentinel value | The curated spot set is small and hand-picked — curation is expected to guarantee connectivity, not defer the problem to runtime. |

## Open Questions & Future Decisions

### Deferred
1. Whether an official GPX/KML course file exists that could replace manual transcription for mile-marker coordinates — if one surfaces, curation method should be revisited.
2. The exact number and selection of curated viewing spots — a curation task, not a design decision.

## References

- `25-BACM-COURSE-MAP-1.pdf` — official 2025 Bank of America Chicago Marathon course map; source for mile-marker coordinates.
