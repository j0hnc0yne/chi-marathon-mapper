---
parent: high-level-design
prefix: MAP
---

# Map Display

## Context and Design Philosophy

Renders the course and the spectator's plan visually: the route itself, time-labeled points along it, and the itinerary suggester's recommended stops highlighted distinctly from the rest. This is the component that turns the other components' data into something a spectator actually looks at. It uses the Google Maps JavaScript API — the one live third-party dependency in the whole page, used only for rendering, per the HLD's System Design.

## Rendering

- **Route:** a polyline connecting course data's mile markers, drawn across the full course.
- **Mile markers:** a marker at each course point. Predicted clock times are not shown as always-on labels — with 26+ points, permanent labels would clutter the map — instead they appear in an info window on hover or click.
- **Suggested stops:** the itinerary suggester's chosen spots are rendered with a visually distinct marker (different icon/color), since these are the primary points the spectator is meant to act on — the full mile-by-mile trail is secondary context. Because a suggested stop's marker takes click priority over any co-located plain mile marker (see Click disambiguation below), its info window carries everything the plain marker's would have, plus the itinerary-specific detail: predicted clock time, sequence number, and computed arrival slack. When the underlying viewing spot is flagged `approximatedMile` (course data's COURSE-009), the info window also notes that the shown time is approximate — the one place that flag reaches the spectator.
- **Empty state:** until the spectator has a valid start time and pace in effect — whether because none has been entered yet, or because input state is showing a partial/malformed-link error (INPUT-007) — the map shows only the bare course route with no predicted times and no suggested stops. This is distinct from the case where valid inputs produce zero or one feasible stop (itinerary suggester's "sparse result"): in that case the route and mile-marker times are rendered as usual, the one stop present (if any) is still rendered with the full suggested-stop marker and info window described above, and a warning message is added noting that no feasible multi-stop plan was found for the given pace. The spectator gets a different message for "no plan in effect yet" versus "your pace doesn't leave a workable multi-stop plan."
- **Click disambiguation:** when two markers sit close enough together that a click could target either, an explicit priority order decides which info window opens, rather than leaving it to the map API's default hit-testing. Suggested stops take priority over plain mile markers. Breaking a tie between two markers of the same tier (two suggested stops, or two plain markers, close enough to overlap) falls back to whichever spot is more prominent/well-known — the concrete ranking used for that is a curation-time detail, not resolved here (see Open Questions).
- **Maps API load failure:** if the Google Maps JavaScript API itself fails to load (network failure, blocked script, quota or referrer rejection), the page displays an explicit error rather than an unexplained blank map area.
- **Course data load failure:** if course data fails to load or validate (course data's COURSE-007/COURSE-008), the page displays an explicit error in place of the map, rather than attempting to render an empty or partial route. Map display is the only rendering-owning component, so it owns surfacing this failure even though the underlying error originates in course data.

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

## Open Questions & Future Decisions

### Deferred
1. Exact icon/color scheme for suggested vs. plain markers — a visual-design detail for implementation.
2. Whether the route polyline spans the full 26.2 miles or only as far as course data's curated resolution reaches — follows from course data's actual curation, not a decision this component owns.
3. Concrete prominence ranking used to break ties between two same-tier overlapping markers (two suggested stops, or two plain markers) — a curation-time detail (e.g. a ranking field on viewing spots).

## References

- `docs/intent/course-data/course-data-design.md` — source of the route and marker coordinates.
- `docs/intent/pace-predictor/pace-predictor-design.md` — source of predicted times shown in info windows.
- `docs/intent/itinerary-suggester/itinerary-suggester-design.md` — source of the highlighted suggested stops.
