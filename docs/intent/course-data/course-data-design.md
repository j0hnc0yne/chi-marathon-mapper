---
parent: high-level-design
prefix: COURSE
---

# Course Data

## Context and Design Philosophy

Every other component (pace prediction, itinerary suggestion, map display) depends on a shared, static description of the 2026 Bank of America Chicago Marathon course: where the course physically runs, which points along it are good places for a spectator to stand, and how long it takes to move between those points. This component owns that data contract. It is data, not behavior — there is no runtime logic here beyond loading and validating the shape of static files checked into the repo.

The course's physical geometry and its mile markers are two different data sets answering two different questions — *where does the route go* and *where is mile 7* — and they are carried separately because they need different densities. A line drawn through the mile markers alone would cut across city blocks, the Chicago River and Lincoln Park, because consecutive markers are a third of a mile apart.

## Data Sets

**Route geometry.** An ordered list of coordinates tracing the course itself, from the start line to the finish line, dense enough that consecutive points are joined by a straight line the course actually runs along:

```json
[ { "lat": 41.8810, "lng": -87.6219 }, { "lat": 41.8915, "lng": -87.6219 }, ... ]
```

The list runs in course order, from the start line at the first point to the finish line at the last. It is not closed: the start and finish are different places, both on Columbus Drive and about two thirds of a mile apart.

Points carry no distance value — cumulative distance is a property of mile markers, not of geometry. Distance along the route means the sum of great-circle distances between consecutive points, so the geometry's vertices define the course's length as well as its shape; a coarser tracing is a slightly shorter course.

The course crosses and retraces itself — the north end doubles back, and the run out to the west side returns along a neighboring street. Two consequences hold throughout this component and everything downstream: a position on the course is identified by its distance from the start, never by its coordinates, since one coordinate can answer to two distances; and no consumer may treat a point's index in the geometry list as meaningful, since the list is a tracing order, not an addressing scheme.

Density follows the course's turns rather than a fixed spacing: a long straight run down one street needs two points, a switchback through a park needs many. The published course map's own vertices are the source and are taken as the intended resolution.

**Mile markers.** An ordered list of points along the course, each carrying the cumulative course distance (in miles, not straight-line distance) and its coordinates:

```json
{ "mile": 3.0, "lat": 41.xxxx, "lng": -87.xxxx }
```

Covers at minimum every full mile (0 through 26) plus the finish (26.2).

Each marker's coordinates lie on the route geometry, at the point reached by traveling its `mile` value of cumulative distance along that geometry from the start. Markers are positions along the route, not independent observations of it — which is why they are derived from the geometry at curation time rather than curated alongside it.

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

A spot's coordinates, name and access notes are hand-curated; its `nearestMile` is not. That field says where on the course the spot sits, which is a measurement against the route geometry rather than a judgment, so it is derived at curation time like the mile markers are. Deriving it also keeps the spot anchored when the route is re-extracted: a curated spot whose declared mile was measured against a different tracing of the course would otherwise quietly report the wrong time.

**Travel-time matrix.** Precomputed, one-time-computed travel times between every pair of curated viewing spots, covering both walking and transit:

```json
{ "from": "spot-mile3-clark", "to": "spot-mile7-webster", "walkMinutes": 42, "transitMinutes": 14 }
```

Driving is not included: the course footprint has active street closures for vehicle traffic during race hours, so driving between spots is not a realistic option on race day itself.

The travel-time matrix stores an explicit entry for each direction of a pair (`A→B` and `B→A` separately) rather than assuming symmetry — real walking and transit routes aren't always identical in both directions (one-way streets, station entrances on one side of a road).

## Curation

Route geometry and mile-marker positions are extracted from the official course map PDF by a checked-in script, not transcribed by hand. The published map is vector artwork, so the course is a drawn path in the file and each printed mile number is a text object at a known position — both are exact data to be read out, not features to be eyeballed off an image.

Everything measured against the route — the geometry, the mile markers, and each viewing spot's `nearestMile` — is produced by a single run of the script, which writes them together. That is what makes the marker-on-route invariant hold by construction rather than by policing: markers are emitted by walking the very geometry emitted beside them. The hand-curated fields the script does not compute (spot names, coordinates, access notes, and the travel-time matrix) are preserved as they stand.

The extraction has six stages:

1. **Read the course path.** Interpret the PDF page's content stream to recover drawn paths in page coordinates, and identify the course by its distinctive drawing style. Exactly one path is expected to match; zero or several means the map's styling has changed and the script stops rather than guessing which is the course.
2. **Georeference.** The map carries printed street-name labels at known positions. Pairing each label with that street's real-world coordinate gives control points for a least-squares fit from page coordinates to latitude and longitude. The control-point table lives in the script, so the mapping is reproducible and auditable rather than a one-time manual alignment.
3. **Set the scale from the race distance.** The course is certified at 26.2 miles — a figure known far more precisely than any street coordinate — so the scale is solved for directly from it, leaving the street labels to fix only the position. The projection is treated as conformal and unrotated, which the labels confirm to within a fraction of a degree.
4. **Put the path in course order.** The order a path is drawn in is a fact about the artwork, not about the race — the published map draws the course starting from the finish — so course order is established by matching the path's two ends against the known start and finish locations rather than assumed from the file. It comes after georeferencing because those known locations are coordinates.
5. **Place mile markers.** Walk cumulative distance from the start along the georeferenced path and emit a marker at mile 0, at each full mile, and at the finish. A marker's coordinates are interpolated along the segment its distance falls within, never snapped to the nearest vertex — vertices can be most of a mile apart on a long straight stretch, and snapping would put the marker at a distance other than the one it claims.
6. **Anchor the viewing spots.** For each curated spot, find where the course passes within sight of it and record that distance as its `nearestMile`.

    Because the course retraces itself, a spot can have more than one such pass, and the rule has two parts. A pass counts only if the course comes within 500 ft of the spot — a spectator cannot pick a specific runner out of a field from further off, so a pass on a neighboring street is not a sighting. Among the passes that do count, the earliest wins: a spectator told the first time they can see their runner can always stay for a later pass, while one told the last time has already missed the earlier one.

    Both parts are load-bearing. Broadway & Belmont has passes at mile 6.94 and mile 8.74; the earlier is 1,118 ft away across a parallel street and the later is 83 ft away, so only the later is a sighting. Wells & North has passes at mile 4.53 and mile 11.12, 169 ft and 201 ft away — both plainly sightings, and near enough to equidistant that choosing by proximity would be a coin toss. Earliest-wins makes it mile 4.53.

    A curated spot with no pass within 500 ft is a curation mistake — the spot is not on the course — and stops the run.

Because stage 3 consumes the race distance, total course length is an input to the fit and cannot also serve as a check on it. The gates below are the independent ones — each tests the result against a fact the map carries that the fit did not consume. A failing gate aborts the run and leaves the existing data file untouched, so a bad extraction cannot ship:

- **Mile labels.** Every mile from 1 to 26 is matched to a number printed on the map, and each lies within 2,000 ft of the position the walk computes for that mile. Which printed number labels which mile is decided by where it sits along the route, because the map prints kilometre markers in the same digits — the k'th kilometre falls at 0.621k miles, far enough from mile k to separate them. The tolerance is loose because the labels are set beside the course with leader lines, sometimes well clear of it to stay legible where the course passes itself three times. What the gate detects is not fine positional error but gross failure: under a wrong fit the printed labels stop lining up with the walk at all, and miles go unmatched.
- **Start and finish.** Both resolve to within 300 ft of the known start and finish locations on Columbus Drive, about two thirds of a mile apart. Because the path is oriented by matching these same two points, this gate no longer detects a reversed path — that is settled by construction in stage 2. What it detects is a fit that is wrong in *both* orientations: a mis-scaled projection, or a path that is not the course at all.
- **Street labels.** No control-point residual exceeds 1,000 ft. A fit that has gone wrong globally shows up here immediately, with residuals running to many thousands of feet.

Accuracy follows from what the gates can hold: total distance and the start and finish are pinned, and the rest of the route is placed to within roughly a city block. That is the resolution the printed map itself offers, and it is enough to put the drawn line on the correct street.

The data file records its provenance in a top-level entry naming the source PDF and what was generated from it — the route geometry, the mile markers and the viewing-spot anchors, but not the hand-curated spot details and travel times that share the file. Provenance is documentation for whoever next re-derives the data; nothing reads it at runtime, and its absence is not a load error.

Provenance says where the data came from but cannot show that the file still matches it, so continuous integration re-runs the extraction and fails if the result differs from the committed file. This closes the one gap the by-construction argument leaves open: a hand-edit to the generated data after the fact, which no runtime check and no amount of documentation would catch.

## Loading

The data is fetched at page load from a URL carrying a version that changes whenever the data changes.

This exists because code and data are cached independently. The built script is named after its own contents, so a new deployment always fetches new code; the data file's address never changed, so a browser holding a cached copy kept serving it. That pairs the newest code with an older data file, and the two can disagree — a build that requires route geometry meeting a cached file recorded before route geometry existed. The mismatch surfaces as the invalid-data error below, which is the right response to data the code cannot use, but the spectator sees a broken page for a discrepancy that is purely an artifact of caching.

Versioning the URL removes the possibility rather than shortening the window: a data file the running code has never seen is at an address no cache holds. The version is derived from the data's own content at build time, so it changes exactly when the data does and not on every rebuild.

## Data Integrity

All four data sets live in one JSON file, curated once, offline, and are expected to already be internally consistent by the time they ship. A failure in any of them fails the whole load — the file is one document, and a plan missing any one data set is not a plan.

The division of labor is worth stating plainly, because the runtime checks look weaker than they are: **curation decides whether the data is correct, runtime decides only whether it is loadable.** Nothing available at runtime can tell a right course from a plausible-looking wrong one — that is what the curation gates above are for. So the checks below deliberately test shape alone, and the app does not attempt to repair bad data at runtime:

- Route geometry that is missing, is not a list, holds fewer than two points, or holds a point with a non-finite coordinate is invalid data — the route cannot be drawn at all, so there is nothing partial to fall back to. These are loadability checks only: a two-point geometry is well-formed and would draw a straight line from start to finish, and no runtime check can know that is wrong. The mile-label gate at curation time is what rejects it.
- A file that fails to parse, or a record missing a required field, is treated as invalid data — the app displays an error rather than proceeding with a partial or guessed-at data set.
- Mile markers with duplicate or non-monotonic `mile` values are a curation bug, not a case the app is designed to tolerate; they fall under the same invalid-data error path.
- When a viewing spot's `nearestMile` doesn't exactly match an existing mile-marker entry, it resolves to the closest available marker by distance, and that resolution is flagged (e.g. an `approximatedMile: true` note on the spot) so downstream consumers can indicate to the spectator that the shown time is approximate.
- Every curated pair in the travel-time matrix is expected to have a real, findable route — curation routes around physical barriers (the river, rail lines) rather than leaving a pair disconnected. There is no "unreachable" sentinel value; connectivity is guaranteed at curation time, not handled as a runtime case.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| Data format | A static JSON file checked into the repo | CSV; data embedded as JS constants | JSON is fetchable without a build step, keeps data cleanly separated from behavior code, and is easy to hand-audit against the official course map. |
| Curation method | Script that extracts the course path and mile-label positions from the official course map PDF | Manual transcription from the printed map; snapping a coarse route to streets with a routing service | The official map is vector artwork, so the course path and its mile labels are exact data in the file. A script is re-runnable against a later year's map and its output is checkable against the map's own scale and labels; hand transcription is neither. A routing service would infer a plausible route rather than read the published one. |
| Route geometry carried as its own data set | Separate ordered coordinate list, no distance values | Drawing the route line through the mile markers; adding intermediate points to the mile-marker list; storing cumulative distance on every geometry point | Consecutive mile markers are a third of a mile apart, so a line through them cuts across blocks, the river and Lincoln Park. Keeping geometry separate lets each data set be exactly as dense as its own job needs, and leaves the mile-marker contract that the pace predictor and itinerary suggester consume unchanged. Distance on every point would be derived data with no consumer. |
| Mile-marker coordinates | Derived by walking cumulative distance along the route geometry | Curated independently from the map's printed mile labels | Markers are positions along the route, so deriving them from it makes "the marker sits on the course" true by construction instead of an invariant to police. The map's printed labels are then free to serve as an independent check on the result rather than being its source. |
| Marker-on-route invariant | Guaranteed at curation time, not checked at runtime | A runtime geometric tolerance check alongside the other integrity checks | One run of the extraction writes both data sets, deriving the markers from the geometry beside them, so the check could only fail if the file were hand-edited after generation. The other integrity checks catch malformed *shape*, which no generator guarantees; this one would re-verify arithmetic the generator already did. |
| Source of the projection's scale | The certified race distance of 26.2 miles | The street-label control points, with race distance kept as an independent check | The race distance is certified to a precision no street-coordinate table can match, so spending it on the scale and the labels on the position puts the error where it is cheapest. The cost is real: total length stops being a check once it is an input, which is why the gates are the mile labels, the start and finish, and the label residuals instead. |
| Mile-marker placement along a segment | Interpolated at the exact distance | Snapped to the nearest geometry vertex | Vertices follow the course's turns, not a distance interval, so on a long straight stretch the nearest vertex can be most of a mile from the mile it is meant to mark. |
| Viewing spot `nearestMile` | Derived from the route geometry at curation time | Hand-curated alongside the spot's other fields | Where a spot sits on the course is a measurement, and a hand-curated one silently goes stale when the route is re-extracted. Deriving it keeps a spot's reported time honest across a re-tracing; the spot's coordinates stay hand-curated, because standing room and transit access are judgments no measurement produces. |
| Which pass anchors a spot the course passes more than once | The earliest pass that comes within 500 ft of the spot | The nearest pass regardless of order; the latest pass; carrying every pass on the spot | A spectator given the first sighting can stay for a later one; one given the last has already missed the earlier. The 500 ft floor is needed because "earliest" alone would anchor Broadway & Belmont to a pass 1,118 ft away on a parallel street, and proximity alone would decide Wells & North's two genuine sightings (169 ft and 201 ft) by a margin too small to mean anything. Carrying every pass is the truthful model but cascades into itinerary ordering, selection, prediction and the list rows for one spot in the current set — deferred, not rejected. |
| Guarding against hand-edits to generated data | Continuous integration re-runs the extraction and fails on any difference | Rely on the provenance entry and human diligence; add runtime checks | Provenance records where the data came from but cannot attest that it still matches. Re-running the generator is the only check that compares the artifact to its source, and it costs one CI step. |
| Where route geometry is stored | A new top-level entry in the existing course data JSON file | Its own file, loaded separately | The four data sets describe one course and are consumed together on one page load; splitting them would add a second fetch and a second failure path to no end. One file also means one provenance record. |
| Establishing course order | Orienting the path by matching its ends to the known start and finish | Trusting the PDF's drawing order; requiring the artwork to be drawn in course order | Drawing order is a property of how the artwork was made, and this map draws the course from the finish backwards. Deriving the orientation costs one comparison and makes the data independent of that incidental choice. The cost is that the endpoint gate stops being able to detect a reversal, since it is now what decides the orientation. |
| Whether a gate checks that each mile's nearest printed label is its own | No — only each mile's distance to its own label is checked | Requiring the nearest printed label to a computed mile position to be that mile's label | The course retraces itself, so nearby miles are genuinely ambiguous by position: the westbound and eastbound passes run one block apart, which puts miles 15 and 16 closer to each other's labels than to their own, and mile 17 nearest to mile 14's label. The check would fail on a correct extraction. A reversed or mis-scaled walk — the failure it was meant to catch — is caught by the per-mile distance gate instead, which such a walk misses by tens of thousands of feet rather than hundreds. |
| Scope of runtime validation | Shape and loadability only; correctness is a curation-time concern | Runtime plausibility checks (coordinate bounds, minimum vertex count, marker-on-route tolerance) | No check available at runtime can distinguish the real course from a plausible-looking wrong one, so plausibility checks would buy the appearance of verification rather than verification. The curation gates test against the published map, which is the only thing that can settle correctness. |
| Route geometry integrity failure | Same invalid-data error path as the other data sets | Render the route from mile markers as a degraded fallback | A fallback that silently draws a wrong route is the failure this data set exists to remove; a visible error is better than a plausible-looking incorrect course. |
| Travel-time matrix shape | Full pairwise matrix (every curated spot to every other, both directions) | Only adjacent-spot pairs; computed on demand at runtime; assume direction-symmetric times | The curated spot set is small (on the order of a dozen), so a full pairwise matrix is cheap to precompute once; storing both directions avoids a false symmetry assumption. |
| Modes in travel-time matrix | Walking and transit only | Also include driving | Race-day street closures make driving between spots unrealistic during the window it would matter. |
| Data integrity failures (parse error, missing field, duplicate/non-monotonic mile values) | Treated as invalid data; the app displays an error | Silently skip bad records; attempt best-effort repair | Bad static data is a curation bug, not a runtime condition to design around — surfacing it loudly catches curation mistakes immediately rather than masking them. |
| Viewing spot's `nearestMile` not exactly matching a marker | Snap to the closest available mile marker, flagged as approximated | Require exact match at curation time; interpolate a synthetic marker | Keeps the marker set a fixed, curated list while still letting spots reference any point on the course; the approximation is small and worth flagging rather than forbidding. |
| Spot pairs separated by a physical barrier (river, rail) | Curation finds a real route around the barrier; every curated pair has a real entry | An explicit "unreachable" sentinel value | The curated spot set is small and hand-picked — curation is expected to guarantee connectivity, not defer the problem to runtime. |

## Open Questions & Future Decisions

### Deferred
1. The exact number and selection of curated viewing spots — a curation task, not a design decision.
2. Whether a viewing spot should carry every pass the course makes within sight of it rather than a single anchoring mile. The course passes Wells & North twice, at mile 4.53 and mile 11.12, and a spectator standing there really can see their runner twice; the single-anchor model cannot say so. Modeling it reaches into itinerary ordering and selection, predicted times, and the chronological list, which is more cascade than one spot in the current curated set justifies.
3. Whether viewing-spot coordinates should also be snapped to the route geometry. They are deliberately *near* the course rather than on it — a spectator stands on the sidewalk, sometimes a block away — so snapping them is not obviously correct, and nothing downstream currently depends on their exact offset from the route. Anything built here has to contend with the course retracing itself: "the nearest point on the route" is not well defined for a spot sitting between two passes, and picking the wrong one moves the spot by several miles of race distance.

## References

- `26-BACM-COURSE-MAP-PRINT.pdf` — official 2026 Bank of America Chicago Marathon course map; source for route geometry and mile-marker positions.
