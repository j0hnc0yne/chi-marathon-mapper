// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  mountForm,
  nextFieldParam,
  parsePaceInput,
  parseStartTimeInput,
  readInitialStateFromParams,
  syncFormToUrl,
} from "./input-state.js";

// Fixed race-day facts: the 2025 Chicago Marathon runs on 2025-10-12, which
// falls in Central Daylight Time (UTC-5). This offset is a known constant
// for this one fixed date, not general timezone-conversion logic.
const RACE_DATE = { isoDate: "2025-10-12", utcOffset: "-05:00" };

describe("parsePaceInput", () => {
  // @spec INPUT-003
  it("parses a well-formed MM:SS pace into decimal minutes per mile", () => {
    expect(parsePaceInput("9:30")).toEqual({ minutesPerMile: 9.5 });
  });

  // @spec INPUT-004
  it("rejects a pace outside the 4:30-15:00 range", () => {
    expect(parsePaceInput("4:29")).toHaveProperty("error");
    expect(parsePaceInput("15:01")).toHaveProperty("error");
    expect(parsePaceInput("4:30")).toEqual({ minutesPerMile: 4.5 });
    expect(parsePaceInput("15:00")).toEqual({ minutesPerMile: 15 });
  });

  // @spec INPUT-004
  it("rejects a malformed MM:SS value, including an out-of-range seconds component", () => {
    expect(parsePaceInput("9:75")).toHaveProperty("error");
    expect(parsePaceInput("nine-thirty")).toHaveProperty("error");
    expect(parsePaceInput("")).toHaveProperty("error");
  });
});

describe("parseStartTimeInput", () => {
  // @spec INPUT-001, INPUT-002
  it("interprets the HH:MM value as Chicago race-day local time regardless of machine timezone", () => {
    const result = parseStartTimeInput("07:30", RACE_DATE);
    expect(result.date.toISOString()).toBe(new Date("2025-10-12T07:30:00-05:00").toISOString());
  });

  it("rejects a malformed time value", () => {
    expect(parseStartTimeInput("not-a-time", RACE_DATE)).toHaveProperty("error");
  });
});

describe("mountForm", () => {
  // @spec INPUT-001
  it("captures start time with a native time input control", () => {
    const container = document.createElement("div");
    const { startInput } = mountForm(container, { onChange: () => {} });
    expect(startInput.tagName).toBe("INPUT");
    expect(startInput.type).toBe("time");
  });

  // @spec INPUT-003
  it("captures pace as free text for MM:SS entry", () => {
    const container = document.createElement("div");
    const { paceInput } = mountForm(container, { onChange: () => {} });
    expect(paceInput.tagName).toBe("INPUT");
    expect(paceInput.type).toBe("text");
  });
});

describe("readInitialStateFromParams", () => {
  // @spec INPUT-005
  it("reports empty status when no start or pace params are present", () => {
    const result = readInitialStateFromParams(new URLSearchParams(""), RACE_DATE);
    expect(result).toEqual({ status: "empty" });
  });

  // @spec INPUT-006
  it("reports valid status and pre-populated values when both params are valid", () => {
    const result = readInitialStateFromParams(new URLSearchParams("start=07:30&pace=9:30"), RACE_DATE);
    expect(result.status).toBe("valid");
    expect(result.paceMinutesPerMile).toBe(9.5);
    expect(result.raceStart.toISOString()).toBe(new Date("2025-10-12T07:30:00-05:00").toISOString());
  });

  // @spec INPUT-007
  it("reports an error status distinct from empty when only one param is present and valid", () => {
    const onlyStart = readInitialStateFromParams(new URLSearchParams("start=07:30"), RACE_DATE);
    expect(onlyStart.status).toBe("error");

    const onlyPace = readInitialStateFromParams(new URLSearchParams("pace=9:30"), RACE_DATE);
    expect(onlyPace.status).toBe("error");

    const oneMalformed = readInitialStateFromParams(new URLSearchParams("start=07:30&pace=bogus"), RACE_DATE);
    expect(oneMalformed.status).toBe("error");
  });
});

describe("nextFieldParam", () => {
  // @spec INPUT-010
  it("removes the param immediately when the field is cleared to empty", () => {
    expect(nextFieldParam("9:30", "", () => true)).toBeUndefined();
  });

  // @spec INPUT-008
  it("updates the param when the field holds a new valid value", () => {
    expect(nextFieldParam("9:30", "10:00", () => true)).toBe("10:00");
  });

  // @spec INPUT-009
  it("leaves the param at its last valid value while the field is non-empty but invalid", () => {
    expect(nextFieldParam("9:30", "10:", () => false)).toBe("9:30");
  });
});

describe("syncFormToUrl", () => {
  // @spec INPUT-008, INPUT-011
  it("updates the URL via replaceState (not pushState) when a field becomes validly changed", () => {
    const replaceState = vi.fn();
    syncFormToUrl({ startRaw: "07:30", paceRaw: "9:30" }, RACE_DATE, {
      replaceState,
      getSearch: () => "",
    });
    expect(replaceState).toHaveBeenCalledTimes(1);
    const [, , url] = replaceState.mock.calls[0];
    expect(url).toContain("start=07%3A30");
    expect(url).toContain("pace=9%3A30");
  });

  // @spec INPUT-009
  it("does not touch the URL when the only change is a field becoming mid-edit invalid", () => {
    const replaceState = vi.fn();
    syncFormToUrl({ startRaw: "07:30", paceRaw: "9:" }, RACE_DATE, {
      replaceState,
      getSearch: () => "start=07%3A30&pace=9%3A30",
    });
    expect(replaceState).not.toHaveBeenCalled();
  });

  // @spec INPUT-010
  it("strips a param immediately when its field is cleared to empty", () => {
    const replaceState = vi.fn();
    syncFormToUrl({ startRaw: "", paceRaw: "9:30" }, RACE_DATE, {
      replaceState,
      getSearch: () => "start=07%3A30&pace=9%3A30",
    });
    const [, , url] = replaceState.mock.calls[0];
    expect(url).not.toContain("start=");
    expect(url).toContain("pace=9%3A30");
  });
});

describe("Recompute pipeline trigger", () => {
  // @spec INPUT-012
  it("invokes pace-predictor, then itinerary-suggester, then map-display in order once state is valid", async () => {
    const { triggerPipeline } = await import("./input-state.js");
    const calls = [];
    const predictTimes = vi.fn(() => {
      calls.push("predict");
      return [];
    });
    const suggestItinerary = vi.fn(() => {
      calls.push("suggest");
      return { stops: [], sparse: true };
    });
    const renderMap = vi.fn(() => {
      calls.push("render");
    });

    triggerPipeline(
      { raceStart: new Date("2025-10-12T07:30:00-05:00"), paceMinutesPerMile: 9.5 },
      {
        courseData: { mileMarkers: [{ mile: 1 }], viewingSpots: [], getTravelTime: () => undefined },
        predictTimes,
        suggestItinerary,
        renderMap,
      },
    );

    expect(calls).toEqual(["predict", "predict", "suggest", "render"]);
  });
});
