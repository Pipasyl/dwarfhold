import { describe, expect, it } from "vitest";
import { advanceDay, hungerMessages, statusFor } from "./simulation"; // D1: added hungerMessages + statusFor
import type { ColonyState, Dwarf } from "./types"; // D1: added Dwarf for the test helper
describe("colony simulation", () => {
  it("produces assigned resources and feeds the company", () => {
    const state: ColonyState = { day: 1, resources: { wood: 0, stone: 0, food: 5, tools: 0 }, dwarves: [{ id: "d1", name: "Brom", title: "", icon: "", assignment: "woodcutting", status: "working" }] };
    expect(advanceDay(state)).toMatchObject({ day: 2, resources: { wood: 3, food: 4 } });
    expect(state.resources.wood).toBe(0);
  });
});

// ---------- D1 tests: each test checks one rule of the hunger system ----------

// Small helper that builds a dwarf, so each test only lists what matters for it
const dwarf = (id: string, extra: Partial<Dwarf> = {}): Dwarf => ({
  id, name: id, title: "", icon: "", assignment: null, status: "idle", ...extra,
});
const colony = (food: number, dwarves: Dwarf[]): ColonyState => ({
  day: 1, resources: { wood: 0, stone: 0, food, tools: 0 }, dwarves,
});

describe("D1 hunger system", () => {
  it("food never goes below 0 and unfed dwarves count a hungry day", () => {
    const next = advanceDay(colony(1, [dwarf("a"), dwarf("b")]));
    expect(next.resources.food).toBe(0);
    expect(next.dwarves.map((d) => d.hungerDays)).toEqual([0, 1]); // list order: a eats, b does not
  });

  it("farmers harvest first and are fed first", () => {
    const next = advanceDay(colony(0, [dwarf("miner", { assignment: "mining" }), dwarf("farmer", { assignment: "farming" })]));
    expect(next.dwarves.find((d) => d.id === "farmer")?.hungerDays).toBe(0);
    expect(next.dwarves.find((d) => d.id === "miner")?.hungerDays).toBe(0); // 4 food harvested, 2 eaten
    expect(next.resources.food).toBe(2);
  });

  it("hunger reduces output: 1 day 50%, 2 days 30%, 3 days 0% (rounded)", () => {
    const wood = (days: number) => advanceDay(colony(0, [dwarf("w", { assignment: "woodcutting", hungerDays: days - 1 })])).resources.wood;
    expect(wood(1)).toBe(2); // 3 * 0.5 = 1.5 -> 2
    expect(wood(2)).toBe(1); // 3 * 0.3 = 0.9 -> 1
    expect(wood(3)).toBe(0);
  });

  it("badge: WORKING until 3 hungry days, then IDLE, even after re-assigning", () => {
    expect(statusFor(dwarf("a", { assignment: "mining", hungerDays: 2 }))).toBe("working");
    expect(statusFor(dwarf("a", { assignment: "mining", hungerDays: 3 }))).toBe("idle");
    const next = advanceDay(colony(0, [dwarf("a", { assignment: "mining", status: "working", hungerDays: 2 })]));
    expect(next.dwarves[0].status).toBe("idle");
  });

  it("chronicle: one message only when the hunger level changes", () => {
    expect(hungerMessages([dwarf("a")], [dwarf("a", { hungerDays: 1 })])[0].text).toContain("goes hungry");
    expect(hungerMessages([dwarf("a", { hungerDays: 3 })], [dwarf("a", { hungerDays: 4 })])).toHaveLength(0); // still level 3
    expect(hungerMessages([dwarf("a", { hungerDays: 2 })], [dwarf("a", { hungerDays: 0 })])[0].tone).toBe("good");
  });
});
