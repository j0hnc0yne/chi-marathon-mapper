// The page's color scheme: system, light or dark.
//
// This is the one piece of state that describes the viewer rather than the plan,
// which is why it never reaches the URL. See docs/intent/theme/theme-design.md.
//
// Two specs here are satisfied by what this module does not do: it never touches
// the URL, and it never listens for storage events, so a choice made in another
// tab does not retheme this one until it reloads.
// @spec THEME-010, THEME-025

const STORAGE_KEY = "chi-marathon-theme";
const PINNED = ["light", "dark"];

// @spec THEME-001
export const THEME_CHOICES = ["system", "light", "dark"];

// @spec THEME-003, THEME-006
export function resolveTheme(choice, systemPrefersDark) {
  if (PINNED.includes(choice)) return choice;
  return systemPrefersDark ? "dark" : "light";
}

/**
 * The stored choice, or "system". Only `light` and `dark` are legal; anything
 * else is deleted rather than left to be re-read and re-rejected on every load.
 *
 * @spec THEME-011, THEME-024
 */
export function readStoredChoice(storage) {
  let stored;
  try {
    stored = storage.getItem(STORAGE_KEY);
  } catch {
    return "system";
  }
  if (stored === null) return "system";
  if (PINNED.includes(stored)) return stored;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do: an unrecognised value that cannot be cleared is still
    // treated as "system" on every load, which is the correct rendering.
  }
  return "system";
}

// Absence of the attribute means "system" — one state with one representation.
// @spec THEME-004, THEME-023
function applyChoiceToRoot(root, choice) {
  if (PINNED.includes(choice)) root.setAttribute("data-theme", choice);
  else root.removeAttribute("data-theme");
}

// @spec THEME-027
export function choiceFromRoot(root) {
  const attribute = root.getAttribute("data-theme");
  return PINNED.includes(attribute) ? attribute : "system";
}

/**
 * Starts the theme. Depends on nothing but the document — not course data, not
 * the map — so the control still works in the states where the rest of the page
 * gives up loading.
 *
 * @spec THEME-002, THEME-007, THEME-017, THEME-033
 */
export function initTheme({ root, storage, matchMedia, onResolvedThemeChange, choice }) {
  const media = matchMedia("(prefers-color-scheme: dark)");
  let current = choice ?? readStoredChoice(storage);
  let resolved = resolveTheme(current, media.matches);

  applyChoiceToRoot(root, current);

  // @spec THEME-018
  const onSystemChange = (event) => {
    if (current !== "system") return;
    const next = resolveTheme(current, event.matches);
    if (next === resolved) return;
    resolved = next;
    onResolvedThemeChange(resolved);
  };

  // @spec THEME-019, THEME-031
  const observeSystem = (shouldObserve) => {
    if (shouldObserve) media.addEventListener("change", onSystemChange);
    else media.removeEventListener("change", onSystemChange);
  };
  observeSystem(current === "system");

  const persist = (next) => {
    try {
      // @spec THEME-008, THEME-009
      if (PINNED.includes(next)) storage.setItem(STORAGE_KEY, next);
      else storage.removeItem(STORAGE_KEY);
    } catch {
      // @spec THEME-012 — the theme still applies to this page view; only the
      // memory of it is lost. Nothing about the plan depends on it.
    }
  };

  return {
    choices: THEME_CHOICES,
    getChoice: () => current,
    getResolved: () => resolved,

    // The attribute is set first: the page repaints in the same frame as the
    // click, and anything reacting to the notification reads the new theme.
    // @spec THEME-015, THEME-030, THEME-032
    setChoice(next) {
      if (!THEME_CHOICES.includes(next)) return;
      current = next;
      applyChoiceToRoot(root, current);
      persist(current);

      const nextResolved = resolveTheme(current, media.matches);
      const changed = nextResolved !== resolved;
      resolved = nextResolved;
      observeSystem(current === "system");
      // Fires for a pin→system switch too, where the system preference never
      // changed and so no media event will arrive.
      if (changed) onResolvedThemeChange(resolved);
    },
  };
}

/**
 * Wires the served control. Its selected option comes from the root attribute,
 * which is what the page is painted from — a second storage read can disagree
 * with it when the pre-paint read raised.
 *
 * @spec THEME-013, THEME-027
 */
export function wireThemeControl(control, theme, root) {
  const select = (choice) => {
    const option = control.querySelector(`input[value="${choice}"]`);
    if (option) option.checked = true;
  };
  select(choiceFromRoot(root));

  control.addEventListener("change", (event) => {
    const choice = event.target?.value;
    if (THEME_CHOICES.includes(choice)) theme.setChoice(choice);
  });
}
