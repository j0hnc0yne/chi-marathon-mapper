// Verifies the stylesheet and the served markup, not behaviour. The theme's
// mechanism is CSS — the palette, the scheme declaration and the pre-paint
// script — so these are the only place those specs can be checked.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

// --- contrast ---------------------------------------------------------------

function channel(value) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((d) => d + d).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Token values declared in one CSS block, e.g. `:root` or `[data-theme="dark"]`. */
function tokensIn(selector) {
  const at = css.indexOf(selector);
  if (at === -1) return {};
  const open = css.indexOf("{", at);
  const close = css.indexOf("}", open);
  const tokens = {};
  for (const [, name, value] of css.slice(open, close).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens[name] = value.trim();
  }
  return tokens;
}

const SCHEMES = {
  light: () => tokensIn(":root"),
  dark: () => ({ ...tokensIn(":root"), ...tokensIn('[data-theme="dark"]') }),
};

// Foreground/background token pairs that carry text, and the ratio each must meet.
const TEXT_PAIRS = [
  ["--color-text", "--color-background", 4.5],
  ["--color-text-secondary", "--color-background", 4.5],
  ["--color-error-text", "--color-error-background", 4.5],
  ["--color-warning-text", "--color-warning-background", 4.5],
  ["--color-input-error", "--color-background", 4.5],
];

const NON_TEXT_PAIRS = [
  ["--color-border", "--color-background", 3],
  ["--color-focus-ring", "--color-background", 3],
];

describe("the colour palette", () => {
  // @spec THEME-020
  it("declares a token for every colour the page paints", () => {
    const light = SCHEMES.light();
    for (const token of [
      "--color-background",
      "--color-text",
      "--color-text-secondary",
      "--color-input-error",
      "--color-error-text",
      "--color-error-background",
      "--color-warning-text",
      "--color-warning-background",
      "--color-map-placeholder",
      "--color-border",
      "--color-focus-ring",
    ]) {
      expect(light[token], `${token} missing from :root`).toBeDefined();
    }
  });

  // @spec THEME-020
  it("gives the dark scheme its own value for every token the light scheme declares", () => {
    const light = tokensIn(":root");
    const dark = tokensIn('[data-theme="dark"]');
    for (const token of Object.keys(light)) {
      expect(dark[token], `${token} has no dark-scheme value`).toBeDefined();
    }
  });

  // @spec THEME-021
  it("declares an explicit background on the body rather than relying on the browser default", () => {
    const body = css.slice(css.indexOf("body {"), css.indexOf("}", css.indexOf("body {")));
    expect(body).toMatch(/background:\s*var\(--color-background\)/);
  });

  // @spec THEME-005
  it("uses no literal colour outside the token declarations", () => {
    // Everything after the token blocks should reference tokens, so a colour
            // left hardcoded is a light-scheme colour that survives into dark mode.
    const afterTokens = css.slice(css.lastIndexOf('[data-theme="dark"]'));
    const body = afterTokens.slice(afterTokens.indexOf("}") + 1);
    const literals = body.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g) ?? [];
    expect(literals).toEqual([]);
  });

  // @spec THEME-022
  it("declares color-scheme so browser-drawn surfaces match the theme", () => {
    expect(css).toMatch(/:root\s*\{[^}]*color-scheme:\s*light/s);
    expect(css).toMatch(/\[data-theme="dark"\][^{]*\{[^}]*color-scheme:\s*dark/s);
    expect(css).toMatch(/prefers-color-scheme:\s*dark[\s\S]*?color-scheme:\s*dark/);
  });

  // @spec THEME-006
  it("guards the dark media query so a pinned light theme wins", () => {
    const at = css.indexOf("prefers-color-scheme: dark");
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(at, at + 400)).toMatch(/:root:not\(\[data-theme="light"\]\)/);
  });
});

describe.each(Object.entries(SCHEMES))("contrast in the %s scheme", (name, load) => {
  const tokens = load();

  // @spec THEME-016
  it.each(TEXT_PAIRS)("%s on %s meets %s:1", (fg, bg, minimum) => {
    expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(minimum);
  });

  // @spec THEME-028, THEME-029
  it.each(NON_TEXT_PAIRS)("%s on %s meets %s:1", (fg, bg, minimum) => {
    expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(minimum);
  });
});

describe("the served markup", () => {
  // @spec THEME-007
  it("applies a pinned theme from an inline head script, before first paint", () => {
    const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
    expect(head).toMatch(/<script>/);
    expect(head).toMatch(/data-theme/);
    // A module would run after first paint, which is the flash this avoids.
    expect(head).not.toMatch(/<script[^>]*type="module"/);
  });

  // @spec THEME-026
  it("serves the theme control in the HTML rather than mounting it from code", () => {
    expect(html).toMatch(/id="theme-control"/);
    for (const choice of ["system", "light", "dark"]) {
      expect(html).toMatch(new RegExp(`value="${choice}"`));
    }
  });

  // @spec THEME-013
  it("gives the control an accessible name of its own alongside each option's label", () => {
    const control = html.slice(html.indexOf('id="theme-control"'));
    const block = control.slice(0, control.indexOf("</fieldset>") + 1);
    expect(block).toMatch(/<legend/);
    expect((block.match(/<label/g) ?? []).length).toBe(3);
    expect((block.match(/type="radio"/g) ?? []).length).toBe(3);
  });

  // @spec THEME-014
  it("renders the control outside the form holding the plan's inputs", () => {
    const form = html.slice(html.indexOf('<form id="inputs"'));
    expect(form.slice(0, form.indexOf("</form>") + 1)).not.toContain("theme-control");
    expect(html.indexOf('id="theme-control"')).toBeLessThan(html.indexOf('<form id="inputs"'));
  });
});

describe("independence from the rest of the page", () => {
  const themeModule = readFileSync(new URL("./theme.js", import.meta.url), "utf8");

  // @spec THEME-033
  it("imports nothing, so applying the theme cannot depend on course data or the map", () => {
    // The module entry point abandons setup when course data or the Maps API
    // fails. A theme that reached for either could not work on those pages.
    expect(themeModule.match(/^\s*import\s/m)).toBeNull();
  });

  // @spec THEME-033
  it("is initialised before the course data and Maps loads that can abort startup", () => {
    const main = readFileSync(new URL("./main.js", import.meta.url), "utf8");
    const themeStart = main.indexOf("initTheme({");
    const controlWired = main.indexOf("wireThemeControl(");
    expect(themeStart).toBeGreaterThan(-1);
    expect(controlWired).toBeGreaterThan(themeStart);
    for (const laterCall of ["await fetchCourseData()", "await loadMapsApi("]) {
      expect(main.indexOf(laterCall)).toBeGreaterThan(controlWired);
    }
  });
});
