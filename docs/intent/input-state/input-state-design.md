---
parent: high-level-design
prefix: INPUT
---

# Input State

## Context and Design Philosophy

Owns the spectator's two inputs — the runner's start time and average pace — and keeps them mirrored between the on-page form and the page's URL query string. The form and the URL are two views of one piece of state, not two separate features: per the HLD's "the plan lives in the URL, not a server" tenet, the current address bar contents must always be enough to reproduce the current view for another viewer, with no separate "generate a link" step to remember.

## Fields

- **Start time** — the runner's actual start-line crossing time. Captured with a native time input control, so the browser handles am/pm or 24-hour formatting per the user's locale rather than the app guessing. The value entered is always interpreted as Chicago race-day local time, regardless of the spectator's own device timezone — the race happens in one place at one fixed time, so a spectator viewing the link from another timezone still needs Chicago time, not a translated one.
- **Pace** — average per-mile pace, entered as `MM:SS` (e.g. `9:30`), matching how runners and spectators already talk about pace. Parsed to decimal minutes before being handed to the pace predictor. Valid input is bounded to 4:30–15:00 minutes per mile — just below the marathon world record at the fast end, and just above the pace needed to finish before course closure at the slow end. A value outside that range, or a malformed `MM:SS` (non-numeric, or a seconds component of 60 or more), is a validation error displayed to the spectator.

## URL Synchronization

State flows in both directions:

- **Load → form:** when the page loads with no query parameters at all, this is treated as a fresh first-time visit — the form starts empty, showing no error. When the page loads with valid `start` and `pace` query parameters, the form is pre-populated and predictions are computed immediately, so a shared link shows a complete plan without the recipient touching the form. When exactly one of the two parameters is present and valid but the other is missing or malformed, that is treated as a distinct error state (rather than falling back to the empty first-visit state) — a partial link signals something broke (a truncated share, a hand-edited URL) rather than a spectator who simply hasn't filled anything in yet.
- **Form → URL:** every valid change to the form updates the URL's query string via `history.replaceState`, so the address bar always reflects exactly what's on screen. `replaceState` is used instead of `pushState` so that editing inputs doesn't fill the browser's back-button history with one entry per keystroke. While a field is mid-edit and not yet valid (e.g. pace typed as `"9:"`), the URL is left unchanged at its last valid value rather than being cleared or updated to something transient. When a previously-valid field is cleared back to empty, its corresponding URL parameter is stripped immediately, keeping the URL an accurate live mirror of the form at all times.

## Recompute Pipeline

Input state is the sole owner of triggering *computation* of the plan. Whenever the form holds a valid start time and pace — whether that validity was just reached via a page load with valid query parameters, or via a subsequent in-page edit — input state invokes pace predictor, then itinerary suggester, then map display, in that order, to refresh the displayed plan. No other component polls or independently decides when to recompute; a valid start+pace pair existing in input state is the one trigger condition for deriving predicted times and an itinerary.

Not everything that reaches map display is a recompute, and what is not is not input state's to trigger. A change of color scheme, for instance, repaints the map without any input having changed: map display is told directly by the theme component, and no prediction or itinerary is derived again. Input state owns when the plan changes; it does not own everything that happens to the display.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| Link generation | URL updates live as the form changes | An explicit "copy share link" action that snapshots current state | Makes "the URL is always the share link" unconditionally true, with nothing for the spectator to remember to do before sharing. |
| History method | `history.replaceState` | `history.pushState` | Avoids polluting back-button history with every keystroke. |
| Pace input format | `MM:SS` per mile | Decimal minutes per mile | Matches familiar runner pace notation; decimal minutes is an internal representation, not a spectator-facing one. |
| Pace validation range | 4:30–15:00 min/mile | No explicit bound; only reject non-numeric input | Bounds an implausible pace (typo or nonsense) while covering everything from just below the world record to just above the pace needed to finish before course closure. |
| Fully-absent URL params (fresh visit, no link shared yet) | Degrade to an empty form, no error | Same as any invalid input | The normal, expected state for a first-time visitor with no plan yet — not an error condition. |
| Partially-specified URL params (one valid, one missing/malformed) | Display an explicit error | Degrade silently to empty, same as fully-absent params | A partial link signals something broke rather than a fresh visit with nothing filled in — worth surfacing distinctly from the empty-form case. |
| URL updates during an in-progress, invalid edit | URL stays at its last valid value; no update until validity returns | Clear the URL immediately on invalidity | Avoids flashing an empty or broken-looking link while the spectator is mid-keystroke. |
| Clearing a valid field back to empty | The corresponding URL param is stripped immediately | Leave a stale value in the URL | Keeps the URL an accurate live mirror of the form at all times. |
| Time input's timezone | Always interpreted as Chicago race-day local time | Interpret in the spectator's own device timezone | The race happens at one fixed place and time; translating to the viewer's timezone would produce the wrong number for anyone outside Chicago. |
| Pipeline recompute ownership | Input state triggers pace predictor → itinerary suggester → map display on every valid start+pace state, and owns computation only — not every redraw of an already-computed plan | A separate orchestrator component; each downstream component polls input state for changes | Input state already owns detecting "the form is now valid" (for both load and edit); giving it the one trigger responsibility avoids an extra component whose whole job is watching another component's state. |

## References

- `docs/intent/pace-predictor/pace-predictor-design.md` — consumer of this component's parsed `raceStart`/`paceMinutesPerMile` values.
