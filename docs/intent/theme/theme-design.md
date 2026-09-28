---
parent: high-level-design
prefix: THEME
---

# Theme

## Context and Design Philosophy

Owns the page's color scheme: whether it renders light or dark, and the control the spectator uses to say which. This is the one piece of state in the app that describes the *viewer* rather than the plan. Per the HLD's "the plan lives in the URL, not a server" tenet, the plan's inputs are mirrored into the URL so they travel in a shared link; a color scheme must not, because a spectator sending their plan to a friend is sending the plan and not their taste. That single distinction is why theme is its own component rather than another field in input state: input state's whole job is keeping form and URL in sync, and the theme deliberately never enters the URL.

The component is small, and most of its work is done by CSS rather than by code. That is a deliberate consequence of the pre-paint constraint below, not an accident of scale.

## The Three States

The spectator's choice is one of:

- **System** — follow the operating system's light/dark preference. The default, and the state a viewer starts in before ever touching the toggle.
- **Light** — pinned light, regardless of the system preference.
- **Dark** — pinned dark, regardless of the system preference.

System is a real, reachable state rather than merely the initial value: a viewer who pins dark in the evening and later wants their machine's sunrise switch honored again has to be able to get back to it.

The **resolved theme** — the one actually painted — is always light or dark. Under System it is whatever the operating system currently reports; under a pin it is the pinned value.

## Resolution and Application

The pinned choice is carried as a `data-theme` attribute on the document root, holding `light` or `dark`. Its *absence* means System. This component owns that attribute exclusively: nothing else sets or reads it, the served HTML ships without it, and only the values `light` and `dark` are ever written. An attribute holding anything else is not a state this component can produce, and CSS falls through to the system preference if one appears.

Colors are CSS custom properties, declared three times: light values on `:root`, dark values under a `prefers-color-scheme: dark` media query, and dark values again under an explicit `[data-theme="dark"]` selector. The media-query block is guarded so that it does not apply when light is pinned — without that guard a light pin would lose to a dark system preference, which is the one thing a pin exists to prevent. All three states therefore resolve in CSS from the attribute alone, and no code assigns a color to anything CSS can reach. (The embedded map is the exception, because CSS cannot reach it; that is map display's concern, described below.)

**Every color in the page becomes a token.** This is an invariant, not a style preference: a single hardcoded color left behind is a light-scheme color that survives into dark mode. The page's current colors are the body text, the header's secondary text, the input validation error, the error and warning message foregrounds and their tinted backgrounds, and the map container's placeholder fill. Two of those need particular attention:

- The body has **no background color declared at all** today, relying on the user agent's default white. Dark mode has nothing to override, so the light scheme has to name its background explicitly before the dark scheme can have one.
- The map container carries a pale placeholder fill, visible at full map height from first paint until the Maps tiles arrive. It is the largest thing on the page during load, so if it is not a token, every dark-mode load flashes a bright block regardless of how early the theme is applied.

**Native controls are themed by declaring the scheme, not by coloring them.** The start-time and pace fields are native inputs — the time field draws a browser-supplied picker — and the page also has scrollbars and focus rings the browser paints. Custom properties cannot reach any of them. So the same selectors that choose the palette also set the CSS `color-scheme` property, which is what tells the browser to draw its own surfaces light or dark. Without it a pinned dark page keeps a white time picker and light scrollbars, because `prefers-color-scheme` no longer matches what is painted.

**Nothing is painted before the theme is known.** A viewer who has pinned dark must not see a white page flash on every load, so the attribute is set by a small inline script in the document head, which runs before first paint. This is the only script in the project that is not a module loaded at the end of the body, and the reason is precisely that a module would run too late. In the System state the script has nothing to do — the media query already resolves it — so the script's only job is to apply a pin that exists.

## Changing the Choice

Selecting a choice is the component's one state transition, and it has four effects: the root attribute is set to the pin or removed for System; the stored choice is written or removed; the resolved theme is reported to map display if it changed; and the system-preference watcher is attached or detached to match the new choice. The attribute is set first, before both the storage write and the notification — the painted page then changes in the same frame as the click rather than waiting on storage, and anything that reads the resolved theme in response to the notification reads the new value rather than the old one.

One case is easy to miss. Switching from a pinned theme back to System changes the resolved theme whenever the system preference differs from the pin — moving from pinned dark to System on a light machine repaints the page — and **no system-preference change event fires**, because the system preference did not change; only which of the two rules applies did. Map display therefore has to be notified from this transition, not only from the watcher. Treating the watcher as the sole source of theme-change notifications would leave the map dark on a now-light page.

## Independence From the Rest of the Page

This component starts up on its own, before and regardless of the app's data and map dependencies. The module that wires the rest of the page abandons setup when course data or the Google Maps API fails to load, and both of those failures leave a page the spectator still reads — an error message they may well be reading at night. A toggle whose markup is served but whose behavior was wired inside the abandoned path would sit there looking operable and do nothing.

So the theme's storage read, attribute application and control wiring depend on nothing but the document. Nothing in this component needs course data, the map, or the plan.

## Persistence

The pinned choice is stored on the viewer's own device, under a single key. Choosing System removes the key rather than storing a third value, so "no stored preference" and "follow the system" are the same state with one representation instead of two that could disagree.

Only `light` and `dark` are legal stored values. Anything else — an empty string, a differently-cased variant, a value from an older or newer build, something typed into devtools — is not a choice this component recognizes, so it is treated as System and deleted on read. Deleting it matters: left in place, an unrecognized value would be re-read and re-rejected on every load, and a later build that happened to recognize it would silently resurrect a choice the spectator never made.

Device storage is not always available — a private window, or blocked site data, can make a read come back empty or make either a read or a write raise. None of that is an error worth showing a spectator, so a failure to read resolves to System, and a failure to write leaves the toggle working for the current page view without the choice surviving a reload. That includes a failed *removal*: choosing System applies immediately, but if the delete does not land, the old pin is still there on the next load. The page is fully usable in every one of those cases; the only thing lost is memory of the choice.

A choice made in one tab does not reach another tab already open on the same device; each tab keeps the choice it resolved at load until it is reloaded. Storage is device-wide, so the two tabs would agree after a reload, and propagating live would mean a second, cross-tab path into the transition above for a situation — two tabs of a one-page planner, open at once, one of them being re-themed — that costs more to keep coherent than it returns.

## The Toggle Control

A three-option control, labeled for each state, placed in the page header and deliberately *not* inside the inputs form. The form holds the plan; the theme is not part of the plan, and putting them together would invite exactly the confusion the tenet exists to prevent — that changing the theme changes the plan, or belongs in the shared link.

The control is a radio group rather than a cycling button, so the current state and the available states are both visible at once, and so it is reachable and operable by keyboard and screen reader without custom key handling. The group carries its own accessible name in addition to the three option labels, so a screen reader announces what the options belong to.

**Its markup is served in the page, not mounted by code.** The rest of the page's controls are built by the module entry point, but that entry point abandons setup when course data or the Maps API fails to load, before it reaches the form — so a code-mounted toggle would be missing from exactly the degraded states this component claims remain fully usable. Serving the markup also means there is no moment after first paint where the control is absent or showing the wrong option.

The control's selected option is read from the root attribute, which is the single source of truth for the current choice — not from a second read of device storage. The two can disagree: if the pre-paint read raised, the attribute is absent and the page is painting System, while a later read might succeed and return a pin. Seeding from the attribute keeps the control showing the theme the spectator is actually looking at.

## Contrast

Both schemes are held to a legibility floor, and the floor is specific: 4.5:1 for body-sized text and the semantic message text against the background each is painted on, 3:1 for large text and for non-text boundaries that carry meaning — input borders and the toggle's own selected-state indication. Focus indicators are included, and they are the ones most easily lost: a platform default focus ring that reads clearly on white can disappear against a retinted background, so each scheme's focus indicator is checked in that scheme rather than assumed from the other.

This is called out because the existing palette cannot simply be inverted — the error and warning messages are dark text on pale tinted backgrounds, and those tints go to near-black under a naive inversion, taking the text with them. Each semantic color needs a deliberate dark-scheme counterpart, not an algorithmic one.

## What Map Display Consumes

The embedded map is not styled by CSS custom properties, so it cannot ride along on the mechanism above. This component therefore exposes two things across the segment boundary: the currently resolved theme, and notification when it changes. Map display owns what it does with them — see its own design doc.

Notification matters in a case the CSS handles invisibly: while the choice is System and the operating system switches, no code runs and the page recolors itself, but the map would be left behind. So while — and only while — the choice is System, the system preference is watched so that a change reaches map display. The watcher is attached when the page loads in System and when a choice changes to System, and detached when a choice changes to a pin — under a pin the system preference cannot affect the resolved theme, so anything the watcher reported would have to be discarded.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| Where the theme is remembered | The viewer's own device, under one key | A URL query parameter beside `start` and `pace`; not remembered at all | A theme in the URL travels with a shared plan and overrides the recipient's own preference. A theme that is not remembered is not a preference. With no server, the device is the only place left. |
| Representation of the System state | Absence of the stored key | Storing an explicit `system` value | One state with one representation. Storing it explicitly creates two ways to mean System — absent and `"system"` — which then have to be kept in agreement for no gain. |
| How the page is recolored | CSS custom properties, selected by a root attribute and a media query | Code that sets styles or swaps a stylesheet when the theme changes | The attribute lets all three states resolve in CSS, so the browser paints the right colors on the first pass. Code-driven restyling has to run after the stylesheet, which is what causes the flash. |
| Where the pin is applied | An inline script in the document head | The existing module entry point at the end of the body; a `<link>` with a media attribute | A module runs after first paint, so a pinned-dark viewer sees a white flash on every load. The head script is an exception to how the rest of the project loads code, and it is the flash that justifies it. |
| Device storage unavailable or throwing | Resolve to System; keep the toggle working for the current view | Show the spectator an error; disable the toggle | Nothing about the plan depends on the theme, so a storage failure has no consequence worth a spectator's attention. Disabling the toggle would turn a private window into a degraded page for no reason. |
| Toggle placement | Page header, outside the inputs form | Inside the inputs form with start time and pace | The form is the plan, and the plan is what the URL carries. Putting a non-plan control among the plan's fields blurs the one distinction this component exists to hold. |
| Toggle control shape | A labeled three-option radio group | A single button that cycles through the states; a two-position switch plus a separate "use system" reset | A radio group shows the current state and the alternatives simultaneously, and gets keyboard and screen-reader behavior from the platform. A cycling button hides both what is selected and what comes next. |
| How map display learns the theme | This component exposes the resolved theme and notifies on change | Map display reads device storage and the media query itself | Two components resolving the same three-state rule from the same raw inputs is one rule implemented twice, free to drift. Resolution lives here; rendering lives there. |
| Watching the system preference | Only while the choice is System | Always; never | Under a pin the system preference cannot affect the resolved theme, so watching it would deliver changes that must then be ignored. Never watching leaves the map stale when the system switches under a System choice. |
| Where the toggle's markup comes from | Served in the page's HTML | Mounted by the module entry point, like the inputs form | The entry point abandons setup when course data or the Maps API fails, before it would mount a toggle — leaving the control missing in the degraded states this component claims stay usable. Served markup also removes any window where the control is absent or shows the wrong option. |
| Source of the control's selected option | The root attribute | A second read of device storage | The attribute is what the page is actually painted from. A second read can disagree with it — a raised pre-paint read leaves the page in System while a later read returns a pin — and the control would then contradict what the spectator sees. |
| Unrecognized stored value | Treated as System and deleted | Treated as System and left in place; treated as an error | Leaving it means re-reading and re-rejecting it on every load, and risks a later build resurrecting a choice the spectator never made. It is not worth an error, because the page renders correctly either way. |
| Theming native browser surfaces (time picker, scrollbars, focus rings) | Declare the CSS `color-scheme` property from the same selectors as the palette | Restyle the controls with custom properties; leave them in the browser's default scheme | Custom properties cannot reach browser-drawn chrome at all. Under a pin, `prefers-color-scheme` no longer matches the painted page, so without declaring the scheme a dark page keeps a white time picker and light scrollbars. |
| A choice made in another open tab | Not propagated; each tab keeps the choice it resolved at load | Propagate live via a storage event | A second cross-tab path into the transition, for two tabs of a one-page planner being re-themed while both are open. They agree again after a reload. |
| Dark-scheme semantic colors | Chosen deliberately per color | Derived from the light values by inversion or lightness flip | The message styles are dark text on pale tints; inverting sends tint and text to near-black together. There is no mechanical transform that keeps a tinted-background pattern legible. |

## Open Questions & Future Decisions

### Deferred
1. The concrete palette values for each scheme — a visual-design detail, constrained by the contrast floor above but not determined by it.
2. Whether the toggle should also offer a high-contrast variant. The platform reports more than light and dark — contrast preference and forced-colors mode among them — so the three states cover the light/dark axis rather than every accessibility preference available. Nobody has asked for more, and the page inherits forced-colors behavior from the browser either way.

## References

- `docs/high-level-design.md` — the "plan lives in the URL" tenet this component is the stated exception to.
- `docs/intent/map-display/map-display-design.md` — consumer of the resolved theme, and owner of restyling the embedded map.
