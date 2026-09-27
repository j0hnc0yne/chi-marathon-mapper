// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initTheme, readStoredChoice, resolveTheme, wireThemeControl } from "./theme.js";

// A stand-in for device storage that can be made to fail the way a private
// window or blocked site data does.
function fakeStorage(initial = {}, { failRead = false, failWrite = false, failRemove = false } = {}) {
  const store = { ...initial };
  return {
    store,
    getItem(key) {
      if (failRead) throw new DOMException("denied");
      return key in store ? store[key] : null;
    },
    setItem(key, value) {
      if (failWrite) throw new DOMException("quota");
      store[key] = value;
    },
    removeItem(key) {
      if (failRemove) throw new DOMException("denied");
      delete store[key];
    },
  };
}

// A stand-in for matchMedia whose preference can be changed, notifying listeners
// the way a real system light/dark switch does.
function fakeMatchMedia(prefersDark = false) {
  const listeners = new Set();
  const media = {
    matches: prefersDark,
    addEventListener: (_event, listener) => listeners.add(listener),
    removeEventListener: (_event, listener) => listeners.delete(listener),
    get listenerCount() {
      return listeners.size;
    },
    setPrefersDark(value) {
      media.matches = value;
      for (const listener of [...listeners]) listener({ matches: value });
    },
  };
  return { media, matchMedia: () => media };
}

function setup({ stored = {}, prefersDark = false, storageOptions = {} } = {}) {
  const root = document.documentElement;
  root.removeAttribute("data-theme");
  const storage = fakeStorage(stored, storageOptions);
  const { media, matchMedia } = fakeMatchMedia(prefersDark);
  const onResolvedThemeChange = vi.fn();
  const theme = initTheme({ root, storage, matchMedia, onResolvedThemeChange });
  return { root, storage, media, theme, onResolvedThemeChange };
}

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
  document.body.replaceChildren();
});

describe("theme choices", () => {
  // @spec THEME-001
  it("offers exactly the three choices: system, light and dark", () => {
    const { theme } = setup();
    expect(theme.choices).toEqual(["system", "light", "dark"]);
  });

  // @spec THEME-002
  it("follows the system preference when no choice has been made", () => {
    expect(setup({ prefersDark: true }).theme.getResolved()).toBe("dark");
    expect(setup({ prefersDark: false }).theme.getResolved()).toBe("light");
  });

  // @spec THEME-003
  it("resolves to the pinned value when a theme is pinned", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  // @spec THEME-006
  it("renders light when light is pinned against a dark system preference", () => {
    const { theme, root } = setup({ prefersDark: true });
    theme.setChoice("light");
    expect(theme.getResolved()).toBe("light");
    expect(root.getAttribute("data-theme")).toBe("light");
  });
});

describe("the root attribute", () => {
  // @spec THEME-004
  it("carries a pinned choice, and represents system by the attribute's absence", () => {
    const { theme, root } = setup();
    theme.setChoice("dark");
    expect(root.getAttribute("data-theme")).toBe("dark");
    theme.setChoice("system");
    expect(root.hasAttribute("data-theme")).toBe(false);
  });

  // @spec THEME-023
  it("never writes a value other than light or dark to the attribute", () => {
    const { theme, root } = setup();
    for (const choice of ["system", "light", "dark"]) {
      theme.setChoice(choice);
      const value = root.getAttribute("data-theme");
      expect(value === null || value === "light" || value === "dark").toBe(true);
    }
  });
});

describe("persistence", () => {
  // @spec THEME-008
  it("stores a pinned choice on the device", () => {
    const { theme, storage } = setup();
    theme.setChoice("dark");
    expect(Object.values(storage.store)).toContain("dark");
  });

  // @spec THEME-009
  it("removes the stored choice when the spectator chooses to follow the system", () => {
    const { theme, storage } = setup({ stored: {} });
    theme.setChoice("dark");
    expect(Object.keys(storage.store)).toHaveLength(1);
    theme.setChoice("system");
    expect(Object.keys(storage.store)).toHaveLength(0);
  });

  // @spec THEME-011
  it("follows the system preference when the stored value is unrecognised", () => {
    for (const bad of ["Dark", "", "sepia", "system", "{}"]) {
      const { theme } = setup({ stored: { "chi-marathon-theme": bad }, prefersDark: true });
      expect(theme.getResolved()).toBe("dark");
      expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    }
  });

  // @spec THEME-011
  it("follows the system preference when reading storage raises", () => {
    const { theme } = setup({ prefersDark: true, storageOptions: { failRead: true } });
    expect(theme.getResolved()).toBe("dark");
  });

  // @spec THEME-024
  it("deletes an unrecognised stored value rather than leaving it to recur", () => {
    const { storage } = setup({ stored: { "chi-marathon-theme": "sepia" } });
    expect(Object.keys(storage.store)).toHaveLength(0);
  });

  // @spec THEME-012
  it("applies the chosen theme for this page view when writing to storage raises", () => {
    const { theme, root } = setup({ storageOptions: { failWrite: true } });
    expect(() => theme.setChoice("dark")).not.toThrow();
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(theme.getResolved()).toBe("dark");
  });

  // @spec THEME-012
  it("applies the system choice for this page view when removing from storage raises", () => {
    const { theme, root } = setup({ stored: { "chi-marathon-theme": "dark" }, storageOptions: { failRemove: true } });
    expect(() => theme.setChoice("system")).not.toThrow();
    expect(root.hasAttribute("data-theme")).toBe(false);
  });

  // @spec THEME-025
  it("does not listen for storage changes, so another tab's choice does not retheme this one", () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    setup();
    const storageListeners = addEventListener.mock.calls.filter(([event]) => event === "storage");
    expect(storageListeners).toEqual([]);
    addEventListener.mockRestore();
  });

  // @spec THEME-010
  it("never writes the theme into the URL", () => {
    const replaceState = vi.spyOn(history, "replaceState");
    const pushState = vi.spyOn(history, "pushState");
    const { theme } = setup();
    theme.setChoice("dark");
    theme.setChoice("system");
    expect(replaceState).not.toHaveBeenCalled();
    expect(pushState).not.toHaveBeenCalled();
    expect(location.search).not.toContain("theme");
    replaceState.mockRestore();
    pushState.mockRestore();
  });
});

describe("reporting the resolved theme", () => {
  // @spec THEME-017, THEME-018
  it("reports a system preference change while following the system", () => {
    const { media, onResolvedThemeChange } = setup({ prefersDark: false });
    media.setPrefersDark(true);
    expect(onResolvedThemeChange).toHaveBeenCalledWith("dark");
  });

  // @spec THEME-019
  it("stops observing the system preference once a theme is pinned", () => {
    const { theme, media, onResolvedThemeChange } = setup({ prefersDark: false });
    theme.setChoice("light");
    onResolvedThemeChange.mockClear();
    media.setPrefersDark(true);
    expect(onResolvedThemeChange).not.toHaveBeenCalled();
  });

  // @spec THEME-030
  it("reports the change when switching from a pin back to following the system, where no system event fires", () => {
    // Pinned dark on a light machine: going back to System repaints the page,
    // but the system preference itself never changed, so no media event fires.
    const { theme, onResolvedThemeChange } = setup({ stored: { "chi-marathon-theme": "dark" }, prefersDark: false });
    onResolvedThemeChange.mockClear();
    theme.setChoice("system");
    expect(onResolvedThemeChange).toHaveBeenCalledWith("light");
  });

  // @spec THEME-030
  it("does not report a change when the resolved theme is unchanged", () => {
    // Pinning dark while the system already prefers dark changes the choice but
    // not the painted theme.
    const { theme, onResolvedThemeChange } = setup({ prefersDark: true });
    onResolvedThemeChange.mockClear();
    theme.setChoice("dark");
    expect(onResolvedThemeChange).not.toHaveBeenCalled();
  });

  // @spec THEME-031
  it("attaches the system observer for a system choice and detaches it for a pin", () => {
    const { theme, media } = setup();
    expect(media.listenerCount).toBe(1);
    theme.setChoice("dark");
    expect(media.listenerCount).toBe(0);
    theme.setChoice("system");
    expect(media.listenerCount).toBe(1);
  });

  // @spec THEME-032
  it("sets the root attribute before notifying, so a listener reads the new theme", () => {
    const root = document.documentElement;
    root.removeAttribute("data-theme");
    const seen = [];
    const theme = initTheme({
      root,
      storage: fakeStorage(),
      matchMedia: fakeMatchMedia(false).matchMedia,
      onResolvedThemeChange: () => seen.push(root.getAttribute("data-theme")),
    });
    theme.setChoice("dark");
    expect(seen).toEqual(["dark"]);
  });
});

describe("readStoredChoice", () => {
  // @spec THEME-011, THEME-024
  it("returns the system choice and clears storage for anything unrecognised", () => {
    const storage = fakeStorage({ "chi-marathon-theme": "chartreuse" });
    expect(readStoredChoice(storage)).toBe("system");
    expect(Object.keys(storage.store)).toHaveLength(0);
  });

  // @spec THEME-011
  it("returns a recognised stored choice unchanged", () => {
    expect(readStoredChoice(fakeStorage({ "chi-marathon-theme": "light" }))).toBe("light");
    expect(readStoredChoice(fakeStorage({ "chi-marathon-theme": "dark" }))).toBe("dark");
  });
});

describe("wireThemeControl", () => {
  function servedControl() {
    const fieldset = document.createElement("fieldset");
    fieldset.id = "theme-control";
    for (const choice of ["system", "light", "dark"]) {
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "theme";
      input.value = choice;
      fieldset.appendChild(input);
    }
    document.body.appendChild(fieldset);
    return fieldset;
  }

  // @spec THEME-027
  it("seeds the selected option from the root attribute, not from storage", () => {
    const root = document.documentElement;
    root.setAttribute("data-theme", "dark");
    // Storage disagrees with the attribute: the attribute is what is painted.
    const storage = fakeStorage({ "chi-marathon-theme": "light" });
    const theme = initTheme({
      root,
      storage,
      matchMedia: fakeMatchMedia(false).matchMedia,
      onResolvedThemeChange: () => {},
      choice: "dark",
    });
    const control = servedControl();
    wireThemeControl(control, theme, root);
    expect(control.querySelector("input[value='dark']").checked).toBe(true);
  });

  // @spec THEME-027
  it("selects the system option when the root attribute is absent", () => {
    const { theme, root } = setup();
    const control = servedControl();
    wireThemeControl(control, theme, root);
    expect(control.querySelector("input[value='system']").checked).toBe(true);
  });

  // @spec THEME-015
  it("applies the chosen theme on change without re-deriving the plan", () => {
    const { theme, root } = setup();
    const control = servedControl();
    const recomputePlan = vi.fn();
    wireThemeControl(control, theme, root, { onPlanNeeded: recomputePlan });
    const dark = control.querySelector("input[value='dark']");
    dark.checked = true;
    dark.dispatchEvent(new Event("change", { bubbles: true }));
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(recomputePlan).not.toHaveBeenCalled();
  });
});
