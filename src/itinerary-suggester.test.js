import { describe, expect, it } from "vitest";
import { suggestItinerary } from "./itinerary-suggester.js";

const START = new Date("2025-10-12T07:30:00-05:00");
const minutes = (n) => new Date(START.getTime() + n * 60_000);

function makeLookup(entries) {
  const map = new Map(entries.map(([from, to, times]) => [`${from}>${to}`, times]));
  return (from, to) => map.get(`${from}>${to}`);
}

describe("suggestItinerary", () => {
  // @spec ITIN-001, ITIN-002
  it("treats a move as feasible only when arrival slack meets the minimum buffer", () => {
    const spots = [
      { id: "A", name: "A", nearestMile: 0, predictedTime: minutes(0) },
      { id: "B", name: "B", nearestMile: 5, predictedTime: minutes(10) },
    ];
    const justFeasible = suggestItinerary(spots, makeLookup([["A", "B", { transitMinutes: 8 }]]), {
      minSlackMinutes: 2,
    });
    expect(justFeasible.stops.map((s) => s.spot.id)).toEqual(["A", "B"]);

    const justInfeasible = suggestItinerary(spots, makeLookup([["A", "B", { transitMinutes: 8.5 }]]), {
      minSlackMinutes: 2,
    });
    expect(justInfeasible.stops.map((s) => s.spot.id)).toEqual(["A"]);
  });

  // @spec ITIN-003
  it("uses the faster of walking/transit when both are present, and whichever is present when only one is", () => {
    const spots = [
      { id: "A", name: "A", nearestMile: 0, predictedTime: minutes(0) },
      { id: "B", name: "B", nearestMile: 5, predictedTime: minutes(20) },
    ];
    const bothModes = suggestItinerary(spots, makeLookup([["A", "B", { walkMinutes: 15, transitMinutes: 5 }]]), {
      minSlackMinutes: 2,
    });
    expect(bothModes.stops[1].travelTimeFromPrevious).toBe(5);

    const walkOnly = suggestItinerary(spots, makeLookup([["A", "B", { walkMinutes: 15 }]]), {
      minSlackMinutes: 2,
    });
    expect(walkOnly.stops[1].travelTimeFromPrevious).toBe(15);
  });

  // @spec ITIN-004
  it("treats a missing travel-time matrix entry as infeasible and continues scanning", () => {
    const spots = [
      { id: "A", name: "A", nearestMile: 0, predictedTime: minutes(0) },
      { id: "B", name: "B", nearestMile: 5, predictedTime: minutes(10) },
      { id: "C", name: "C", nearestMile: 10, predictedTime: minutes(30) },
    ];
    const lookup = makeLookup([["A", "C", { transitMinutes: 5 }]]); // no A->B entry
    const result = suggestItinerary(spots, lookup, { minSlackMinutes: 2 });
    expect(result.stops.map((s) => s.spot.id)).toEqual(["A", "C"]);
  });

  // @spec ITIN-005
  it("orders spots by nearest mile, breaking ties alphabetically by name", () => {
    const spots = [
      { id: "z", name: "Zebra Point", nearestMile: 5, predictedTime: minutes(10) },
      { id: "a", name: "Ardmore Ave", nearestMile: 5, predictedTime: minutes(10) },
      { id: "start", name: "Start", nearestMile: 0, predictedTime: minutes(0) },
    ];
    // Only the alphabetical scan order start -> a -> z has a feasible entry for
    // every hop; a wrong tie-break (z before a) would hit a missing entry and
    // drop a spot.
    const lookup = makeLookup([
      ["start", "a", { transitMinutes: 5 }],
      ["a", "z", { transitMinutes: 0 }],
    ]);
    const result = suggestItinerary(spots, lookup, { minSlackMinutes: 0 });
    expect(result.stops.map((s) => s.spot.id)).toEqual(["start", "a", "z"]);
  });

  // @spec ITIN-006
  it("greedily keeps the first feasible next spot rather than searching for a better later choice", () => {
    const spots = [
      { id: "A", name: "A", nearestMile: 0, predictedTime: minutes(0) },
      { id: "B", name: "B", nearestMile: 3, predictedTime: minutes(10) },
      { id: "C", name: "C", nearestMile: 4, predictedTime: minutes(11) },
    ];
    const lookup = makeLookup([
      ["A", "B", { transitMinutes: 8 }], // slack 2, feasible
      ["A", "C", { transitMinutes: 8 }], // slack 3, feasible
      ["B", "C", { transitMinutes: 0.9 }], // slack 0.1, infeasible
    ]);
    const result = suggestItinerary(spots, lookup, { minSlackMinutes: 2 });
    expect(result.stops.map((s) => s.spot.id)).toEqual(["A", "B"]);
  });

  // @spec ITIN-007
  it("returns each stop with its spot, predicted time, travel time from the previous stop, and arrival slack", () => {
    const spots = [
      { id: "A", name: "A", nearestMile: 0, predictedTime: minutes(0) },
      { id: "B", name: "B", nearestMile: 5, predictedTime: minutes(10) },
    ];
    const result = suggestItinerary(spots, makeLookup([["A", "B", { transitMinutes: 5 }]]), { minSlackMinutes: 2 });
    expect(result.stops[1]).toMatchObject({
      spot: { id: "B" },
      predictedTime: minutes(10),
      travelTimeFromPrevious: 5,
      arrivalSlack: 5,
    });
  });

  // @spec ITIN-008
  it("flags the result as sparse when zero or one stop is feasible", () => {
    const single = suggestItinerary(
      [{ id: "A", name: "A", nearestMile: 0, predictedTime: minutes(0) }],
      makeLookup([]),
      { minSlackMinutes: 2 },
    );
    expect(single.sparse).toBe(true);

    const spots = [
      { id: "A", name: "A", nearestMile: 0, predictedTime: minutes(0) },
      { id: "B", name: "B", nearestMile: 5, predictedTime: minutes(10) },
    ];
    const multi = suggestItinerary(spots, makeLookup([["A", "B", { transitMinutes: 2 }]]), { minSlackMinutes: 2 });
    expect(multi.sparse).toBe(false);
  });

  // @spec ITIN-009
  it("always anchors the itinerary at the first curated spot in course order", () => {
    const spots = [
      { id: "A", name: "A", nearestMile: 0, predictedTime: minutes(0) },
      { id: "B", name: "B", nearestMile: 5, predictedTime: minutes(10) },
    ];
    // No feasible move at all from A; A must still be the first (and only) stop.
    const result = suggestItinerary(spots, makeLookup([["A", "B", { transitMinutes: 100 }]]), {
      minSlackMinutes: 2,
    });
    expect(result.stops.map((s) => s.spot.id)).toEqual(["A"]);
  });
});
