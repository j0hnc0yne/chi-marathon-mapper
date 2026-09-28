# Theme — EARS Specs

## Theme Choice

- [x] **THEME-001**: The system shall offer exactly three theme choices: follow the operating system's preference, pinned light, and pinned dark.
- [x] **THEME-002**: While the spectator has made no theme choice, the system shall follow the operating system's light/dark preference.
- [x] **THEME-003**: The system shall resolve the theme it renders to either light or dark, taking the operating system's current preference while the choice is to follow the system, and the pinned value otherwise.

## Application

- [x] **THEME-004**: The system shall represent a pinned theme choice as a `data-theme` attribute on the document root, and shall represent the follow-the-system choice by the absence of that attribute.
- [x] **THEME-005**: The system shall define every themed color as a CSS custom property selected by the document root's `data-theme` attribute and the `prefers-color-scheme` media query, without code assigning a color to any surface CSS can reach.
- [x] **THEME-020**: The system shall define a color token for every color it paints, including the page background, the header's secondary text, the input validation error, each message foreground and tinted background, and the map container's placeholder fill.
- [x] **THEME-021**: The system shall declare an explicit background color on the page body in both schemes, rather than relying on the user agent's default.
- [x] **THEME-022**: The system shall declare the CSS `color-scheme` property from the same selectors that choose the palette, so that browser-drawn surfaces — the time input's picker, scrollbars and focus rings — match the rendered theme.
- [x] **THEME-023**: The system shall write only the values `light` and `dark` to the document root's `data-theme` attribute.
- [x] **THEME-006**: While light is pinned and the operating system prefers dark, the system shall render the light scheme.
- [x] **THEME-007**: The system shall apply a pinned theme choice before the page's first paint.

## Persistence

- [x] **THEME-008**: When the spectator pins light or dark, the system shall store that choice on the viewer's own device.
- [x] **THEME-009**: When the spectator chooses to follow the operating system, the system shall remove any stored theme choice rather than storing a value for it.
- [x] **THEME-010**: The system shall not write the theme choice into the URL query string, and a shared link shall not carry it.
- [x] **THEME-011**: If reading the stored theme choice fails, or the stored value is not one of the recognised theme choices, then the system shall follow the operating system's preference.
- [x] **THEME-024**: If the stored theme choice is not one of the recognised theme choices, then the system shall delete it rather than leave it stored.
- [x] **THEME-025**: A theme choice made in one browser tab shall not change the theme of another tab already open on the same device until that tab reloads.
- [x] **THEME-012**: If writing the theme choice to device storage fails, then the system shall apply the chosen theme to the current page view and shall not display an error.

## Toggle Control

- [x] **THEME-013**: The system shall present the theme choice as a radio group showing all three choices with the current choice selected, carrying an accessible name for the group in addition to a label on each choice.
- [x] **THEME-026**: The system shall serve the theme control's markup in the page's HTML rather than mounting it from code, so that the control is present when course data or the Maps API fails to load.
- [x] **THEME-027**: The system shall set the theme control's selected choice from the document root's `data-theme` attribute rather than from a second read of device storage.
- [x] **THEME-014**: The system shall render the theme control outside the form holding the plan's inputs.
- [x] **THEME-015**: When the spectator changes the theme choice, the system shall apply the newly resolved theme without re-deriving predicted mile-marker times or the suggested itinerary.
- [x] **THEME-032**: When the spectator changes the theme choice, the system shall set or remove the document root's `data-theme` attribute before writing to or removing from device storage and before notifying map display.
- [x] **THEME-033**: The system shall apply the theme and wire the theme control without depending on course data or the Google Maps API having loaded, so that the control remains operable when either fails.

## Contrast

- [x] **THEME-016**: Body-sized text and each semantic message text shall meet a contrast ratio of at least 4.5:1 against the background it is rendered on, in both the light and the dark scheme.
- [x] **THEME-028**: Large text, input borders and the theme control's selected-state indication shall meet a contrast ratio of at least 3:1 against their own background, in both the light and the dark scheme.
- [x] **THEME-029**: The focus indicator shall meet a contrast ratio of at least 3:1 against the background it appears on, in each scheme independently.

## Reporting the Resolved Theme

- [x] **THEME-017**: The system shall expose the currently resolved theme to map display.
- [x] **THEME-018**: While the theme choice is to follow the operating system, the system shall observe the operating system's preference and shall notify map display when the resolved theme changes.
- [x] **THEME-019**: While a theme is pinned, the system shall not observe the operating system's preference.
- [x] **THEME-030**: When the spectator changes the theme choice and the resolved theme changes as a result, the system shall notify map display from that change, including when switching from a pinned theme to following the operating system, where no operating-system preference change occurs.
- [x] **THEME-031**: When the theme choice changes, the system shall attach the operating-system preference observer if the new choice is to follow the system, and detach it if the new choice is a pinned theme.
