---
parent: high-level-design
prefix: MAP
---

# Map Display

## Context and Design Philosophy

Renders the course and the spectator's plan visually: the route itself, time-labeled points along it, and the itinerary suggester's recommended stops highlighted distinctly from the rest — plus the same plan again as a chronological text list beneath the map, for a spectator who wants to scan it without clicking markers. This is the component that turns the other components' data into something a spectator actually looks at. It uses the Google Maps JavaScript API — the one live third-party dependency in the whole page, used only for rendering, per the HLD's System Design.

## Rendering

- **Route:** a polyline connecting course data's mile markers, drawn across the full course.
- **Mile markers:** a marker at each course point. Predicted clock times are not shown as always-on labels — with 26+ points, permanent labels would clutter the map — instead they appear in an info window on hover or click.
- **Suggested stops:** the itinerary suggester's chosen spots are rendered with a visually distinct marker (different icon/color), since these are the primary points the spectator is meant to act on — the full mile-by-mile trail is secondary context. Because a suggested stop's marker takes click priority over any co-located plain mile marker (see Click disambiguation below), its info window carries everything the plain marker's would have, plus the itinerary-specific detail: predicted clock time, sequence number, and computed arrival slack. When the underlying viewing spot is flagged `approximatedMile` (course data's COURSE-009), the info window also notes that the shown time is approximate — the one place that flag reaches the spectator.
- **Empty state:** until the spectator has a valid start time and pace in effect — whether because none has been entered yet, or because input state is showing a partial/malformed-link error (INPUT-007) — the map shows only the bare course route with no predicted times and no suggested stops. This is distinct from the case where valid inputs produce zero or one feasible stop (itinerary suggester's "sparse result"): in that case the route and mile-marker times are rendered as usual, the one stop present (if any) is still rendered with the full suggested-stop marker and info window described above, and a warning message is added noting that no feasible multi-stop plan was found for the given pace. The spectator gets a different message for "no plan in effect yet" versus "your pace doesn't leave a workable multi-stop plan."
- **Click disambiguation:** when two markers sit close enough together that a click could target either, an explicit priority order decides which info window opens, rather than leaving it to the map API's default hit-testing. Suggested stops take priority over plain mile markers. Breaking a tie between two markers of the same tier (two suggested stops, or two plain markers, close enough to overlap) falls back to whichever spot is more prominent/well-known — the concrete ranking used for that is a curation-time detail, not resolved here (see Open Questions).
- **Maps API load failure:** if the Google Maps JavaScript API itself fails to load (network failure, blocked script, quota or referrer rejection), the page displays an explicit error rather than an unexplained blank map area.
- **Course data load failure:** if course data fails to load or validate (course data's COURSE-007/COURSE-008), the page displays an explicit error in place of the map, rather than attempting to render an empty or partial route. Map display is the only rendering-owning component, so it owns surfacing this failure even though the underlying error originates in course data.

## List Rendering

Below the map, the same plan is rendered a second time as an ordered, chronological text list — a non-map view of exactly what Rendering above puts on the map, not a separate computation.

- **Rows:** one row per mile marker (in course order), showing "Mile X — HH:MM"; and one row per suggested stop (in itinerary order), showing its sequence number, spot name, `accessNotes`, predicted clock time, and computed arrival slack — the same fields carried in the suggested-stop info window (MAP-005), plus `accessNotes` for extra scannability in the list specifically. A suggested stop's row is never merged into or substituted for its nearest mile marker's row: both appear, mirroring the map's overlap handling (MAP-008), since a stop's own predicted time doesn't always match the mile marker it's nearest to.
- **Ordering:** all rows — mile markers and suggested stops together — are sorted by predicted clock time ascending, giving one unified chronological list. When a mile-marker row and a suggested-stop row land at the exact same predicted time, the suggested-stop row is listed first, matching the map's existing click-priority precedent that suggested stops take precedence over plain markers (MAP-009).
- **Approximated stops:** a suggested-stop row notes when its underlying viewing spot is flagged `approximatedMile` (COURSE-009), same as the map's info window (MAP-005).
- **Empty / error states:** the list follows map display's existing state rules exactly, with no separate resilience of its own — empty (no rows) while no valid input is in effect (MAP-006); full mile-marker rows plus any single sparse stop while itinerary suggester returns zero or one feasible stop (MAP-007); and suppressed (no list rendered at all) whenever the map itself is suppressed by a course-data or Maps-API load error (MAP-010, MAP-012). The list is not designed to degrade independently of the map even though it doesn't itself call the Maps API — see Decisions & Alternatives.
- **Sparse-result warning:** while the sparse-stop state (MAP-007) is in effect, the same warning message is rendered a second time immediately alongside the list, not only above the map — a spectator who scrolls straight to the list shouldn't miss why only one stop appears.

## API Key Handling

The Google Maps JavaScript API key is loaded client-side and checked into the repository's source directly — this looks like exposing a secret but isn't: Maps JS API keys are designed to be used client-side, and the actual security boundary is an HTTP-referrer restriction configured in the Google Cloud Console limiting the key to the GitHub Pages origin. No server-side proxy is needed or possible given the fully-static hosting constraint.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| API key exposure | Referrer-restricted client key, checked into source | Server-side proxy to hide the key | No server exists (fully static hosting); referrer restriction is the intended security model for this kind of key, not a workaround. |
| Time labels | Shown on hover/click via info windows | Always-on labels at every marker | 26+ simultaneous labels would clutter the map; on-demand display keeps the base view readable. |
| Suggested-stop styling | Visually distinct marker from plain mile markers | All points styled identically | Suggested stops are the actionable output of the plan; they should read as the primary thing to look at. |
| Google Maps API fails to load | Display an explicit error state | Fall back to a blank/static map | A silently blank map reads as broken with no explanation; an explicit error tells the spectator what happened. |
| Course data fails to load or validate | Map display renders an explicit error in place of the map | Render an empty/partial route silently; have course data itself own error display | Map display is the only component that renders anything to the spectator, so it's the natural owner of surfacing a failure that originates upstream in a data-only component. |
| Valid inputs but zero or one feasible itinerary stop | Render the route/mile markers as usual, still render any single feasible stop with full suggested-stop styling, plus a warning message that no feasible multi-stop plan was found | Reuse the identical pre-input empty state; show the warning without the one real stop found | These are different situations for the spectator — "no plan in effect yet" versus "your pace doesn't leave a workable multi-stop plan, but here's the one spot that does work" — and the one useful result shouldn't be dropped along with the warning. |
| input-state's partial/malformed-link error (INPUT-007) | Collapses into the same bare-route empty state as no-input-yet (MAP-006) | A third, distinct map rendering for this case | The error itself is form-side (input state already displays it); adding a separate map treatment for a state that's otherwise identical to "no valid input yet" is complexity the spectator doesn't need. |
| Overlapping suggested-stop and plain-marker coordinates | Both markers drawn stacked at the same point | Suppress the plain marker in favor of the suggested one | Preserves both pieces of information (this is a suggested stop, and it's also mile X) rather than hiding one — the suggested stop's info window already carries the plain marker's clock time too. |
| Click target when markers are close enough to overlap | An explicit priority order resolves which info window opens — suggested stops before plain mile markers | Let the browser/API's default hit-testing decide arbitrarily | An arbitrary default would make the map feel unpredictable; explicit priority keeps click behavior consistent. |
| `approximatedMile`-flagged spots | Noted in the suggested stop's info window | Leave the flag unsurfaced (curation-internal only) | Course data produces this flag specifically so the spectator can be told a time is approximate; map display's info window is the only spectator-facing surface available to carry it. |
| List content scope | Every mile marker row plus every suggested-stop row, merged into one chronological list | Suggested stops only; all mile markers only; all curated viewing spots regardless of feasibility | Gives the list full textual parity with everything the map already renders — every dot plus the distinct suggested-stop markers — rather than a narrower subset. |
| Viewing-spot location text shown in list rows | Spot name plus `accessNotes` | Name only, matching the map's info-window text exactly | The list is meant to be the scannable, non-map view of the plan; the extra access detail is more valuable in a read-without-clicking format than it is in an info window the spectator already opened by clicking. |
| Suggested stop chronologically coincides with or sits near its nearest mile marker in the list | Both rows rendered separately, never merged | Merge into a single row | Preserves both pieces of information exactly like the map's overlapping-marker handling (MAP-008); a stop's own predicted time can differ from its nearest marker's, so merging would misstate one of the two times. |
| Tie-break when a mile-marker row and a suggested-stop row share the exact same predicted time | Suggested-stop row listed first | Mile-marker row listed first; arbitrary/insertion order | Matches the map's existing click-priority precedent (MAP-009) that suggested stops take precedence over plain markers, keeping map and list behavior consistent with each other. |
| List rendering when the Google Maps JS API fails to load, or course data fails/is invalid | List is suppressed along with the map — no independent resilience | Decouple the list from Maps API load success so it still renders from course data + pace predictor + itinerary suggester alone, since the list itself never calls the Maps API | The app's startup sequence loads course data and the Maps API before wiring the input pipeline at all; decoupling would mean restructuring that startup order for a failure mode that already blocks the map, the primary display surface. Keeping them coupled favors simplicity over a marginal robustness gain, per the HLD's "plausible plan beats a precise one" tenet. |
| Sparse-result warning placement now that a list exists below the map | Rendered a second time next to the list, in addition to the existing warning above the map | Single shared warning above the map only | The list is now a second, independent entry point to the same plan — a spectator who scrolls straight to it without reading above the map would otherwise miss why only one stop is present. |

## Open Questions & Future Decisions

### Deferred
1. Exact icon/color scheme for suggested vs. plain markers — a visual-design detail for implementation.
2. Whether the route polyline spans the full 26.2 miles or only as far as course data's curated resolution reaches — follows from course data's actual curation, not a decision this component owns.
3. Concrete prominence ranking used to break ties between two same-tier overlapping markers (two suggested stops, or two plain markers) — a curation-time detail (e.g. a ranking field on viewing spots).
4. Decoupling list rendering from Maps API load success so the list still renders when only the map fails — deferred as low-value given how rarely the Maps script itself fails (blocked script, quota, referrer misconfiguration).

## References

- `docs/intent/course-data/course-data-design.md` — source of the route and marker coordinates.
- `docs/intent/pace-predictor/pace-predictor-design.md` — source of predicted times shown in info windows.
- `docs/intent/itinerary-suggester/itinerary-suggester-design.md` — source of the highlighted suggested stops.
