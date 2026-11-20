import { describe, expect, it } from "vitest";
import { advanceDay, departExpedition, forgeMessages, hungerMessages, returnFromExpedition, startCraft, statusFor, toggleTool } from "./simulation"; // D1: hungerMessages + statusFor, D2: toggleTool, D3: startCraft + forgeMessages (instant craft removed), D4: departExpedition + returnFromExpedition
import type { ColonyState, Dwarf } from "./types"; // D1: added Dwarf for the test helper
describe("colony simulation", () => {
  it("produces assigned resources and feeds the company", () => {
    const state: ColonyState = { day: 1, resources: { wood: 0, stone: 0, food: 5, tools: 0, weapons: 0 }, dwarves: [{ id: "d1", name: "Brom", title: "", icon: "", assignment: "woodcutting", status: "working" }] };
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
  day: 1, resources: { wood: 0, stone: 0, food, tools: 0, weapons: 0 }, dwarves, // D2: weapons added
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

// ---------- D2 tests: tools, equipment and weapons ----------
describe("D2 tools and weapons", () => {
  it("a tool adds +1 of the assigned resource (all three jobs)", () => {
    const out = (job: "woodcutting" | "mining" | "farming") =>
      advanceDay(colony(10, [dwarf("a", { assignment: job, hasTool: true })])).resources;
    expect(out("woodcutting").wood).toBe(4);
    expect(out("mining").stone).toBe(3);
    expect(out("farming").food).toBe(10 + 5 - 1); // 5 harvested, 1 eaten
  });

  it("hunger reduces the total with the tool, and 3+ hungry days still means 0", () => {
    const wood = (days: number) =>
      advanceDay(colony(0, [dwarf("a", { assignment: "woodcutting", hasTool: true, hungerDays: days - 1 })])).resources.wood;
    expect(wood(1)).toBe(2); // round(4 * 0.5)
    expect(wood(3)).toBe(0);
  });

  it("no bonus while away on an expedition", () => {
    const next = advanceDay(colony(5, [dwarf("a", { assignment: "woodcutting", hasTool: true, status: "expedition" })]));
    expect(next.resources.wood).toBe(0);
  });

  it("equip and return keep the total number of tools the same", () => {
    const start = { ...colony(5, [dwarf("a")]), resources: { wood: 0, stone: 0, food: 5, tools: 1, weapons: 0 } };
    const equipped = toggleTool(start, "a");
    expect(equipped.resources.tools).toBe(0);
    expect(equipped.dwarves[0].hasTool).toBe(true);
    const returned = toggleTool(equipped, "a");
    expect(returned.resources.tools).toBe(1);
    expect(returned.dwarves[0].hasTool).toBe(false);
  });

  it("invalid equip changes nothing: no free tool, or dwarf away", () => {
    const noTool = colony(5, [dwarf("a"), dwarf("b", { hasTool: true })]); // 0 tools in stock
    expect(toggleTool(noTool, "a")).toBe(noTool); // second dwarf cannot get one (max 1 tool per dwarf, no sharing)
    const away = colony(5, [dwarf("a", { hasTool: true, status: "expedition" })]);
    expect(toggleTool(away, "a")).toBe(away);
  });

  it("forge checks ALL materials and an invalid attempt changes nothing", () => {
    // D3: uses startCraft now (crafting is timed), materials are taken at the start
    const rich = { ...colony(0, [dwarf("a")]), resources: { wood: 5, stone: 4, food: 0, tools: 0, weapons: 0 } };
    expect(startCraft(rich, "weapon", "a").resources).toMatchObject({ wood: 3, stone: 0, weapons: 0 });
    const noStone = { ...colony(0, [dwarf("a")]), resources: { wood: 9, stone: 1, food: 0, tools: 0, weapons: 0 } };
    expect(startCraft(noStone, "tool", "a")).toBe(noStone); // starter bug: stone went negative here
  });
});

// ---------- D3 tests: crafting takes a dwarf and time ----------
describe("D3 timed crafting", () => {
  const stocked = (dwarves: Dwarf[]) => ({
    ...colony(10, dwarves), resources: { wood: 10, stone: 10, food: 10, tools: 0, weapons: 0 },
  });

  it("start: materials taken, dwarf CRAFTING, no item yet", () => {
    const next = startCraft(stocked([dwarf("a", { assignment: "mining", status: "working" })]), "weapon", "a");
    expect(next.resources).toMatchObject({ wood: 8, stone: 6, weapons: 0 });
    expect(next.dwarves[0].status).toBe("crafting");
    expect(next.forgeJob).toEqual({ dwarfId: "a", recipe: "weapon", daysLeft: 2 });
  });

  it("the crafter does not do their job; the item arrives after the recipe's days, then back to work", () => {
    let state = startCraft(stocked([dwarf("a", { assignment: "mining", status: "working" })]), "weapon", "a");
    state = advanceDay(state);
    expect(state.resources.stone).toBe(6); // no mining while crafting
    expect(state.resources.weapons).toBe(0);
    state = advanceDay(state);
    expect(state.resources.weapons).toBe(1); // exactly once, after 2 days
    expect(state.forgeJob).toBeNull();
    expect(state.dwarves[0].status).toBe("working"); // back to their own job
    expect(forgeMessages({ ...state, forgeJob: { dwarfId: "a", recipe: "weapon", daysLeft: 1 } }, state)).toHaveLength(1);
  });

  it("invalid attempts change nothing: forge busy, away, too hungry, unknown dwarf", () => {
    const busy = startCraft(stocked([dwarf("a"), dwarf("b")]), "tool", "a");
    expect(startCraft(busy, "tool", "b")).toBe(busy); // one forge = one craft at a time
    const away = stocked([dwarf("a", { status: "expedition" })]);
    expect(startCraft(away, "tool", "a")).toBe(away);
    const starving = stocked([dwarf("a", { hungerDays: 3 })]);
    expect(startCraft(starving, "tool", "a")).toBe(starving);
    expect(startCraft(away, "tool", "nobody")).toBe(away);
  });

  it("a crafter who is 3+ days hungry pauses the craft", () => {
    const state = { ...colony(0, [dwarf("a", { status: "crafting", hungerDays: 2 })]), forgeJob: { dwarfId: "a", recipe: "tool" as const, daysLeft: 1 } };
    const next = advanceDay(state); // no food -> 3rd hungry day
    expect(next.forgeJob?.daysLeft).toBe(1);
    expect(next.resources.tools).toBe(0);
  });

  it("tools can't be swapped while crafting", () => {
    const state = { ...stocked([dwarf("a", { status: "crafting" })]), resources: { wood: 0, stone: 0, food: 0, tools: 1, weapons: 0 } };
    expect(toggleTool(state, "a")).toBe(state);
  });
});

// ---------- D4 tests: resilient expeditions ----------
describe("D4 resilient expeditions", () => {
  it("depart: dwarf away, tool stays equipped, stock unchanged", () => {
    const start = colony(5, [dwarf("a", { assignment: "mining", status: "working", hasTool: true })]);
    const away = departExpedition(start, "a");
    expect(away.dwarves[0]).toMatchObject({ status: "expedition", hasTool: true });
    expect(away.resources).toEqual(start.resources);
  });

  it("success: rewards added exactly once, dwarf back to their job", () => {
    const away = departExpedition(colony(5, [dwarf("a", { assignment: "mining" })]), "a");
    const back = returnFromExpedition(away, "a", { stone: 8, tools: 1 });
    expect(back.resources).toMatchObject({ stone: 8, tools: 1 });
    expect(back.dwarves[0].status).toBe("working");
    expect(returnFromExpedition(back, "a", { stone: 8, tools: 1 })).toBe(back); // repeated answer -> nothing
  });

  it("failure: dwarf comes back, no rewards", () => {
    const away = departExpedition(colony(5, [dwarf("a")]), "a");
    const back = returnFromExpedition(away, "a", {});
    expect(back.dwarves[0].status).toBe("idle");
    expect(back.resources).toEqual(away.resources);
  });

  it("invalid departures change nothing: already away, crafting, too hungry", () => {
    const away = colony(5, [dwarf("a", { status: "expedition" })]);
    expect(departExpedition(away, "a")).toBe(away);
    const crafting = colony(5, [dwarf("a", { status: "crafting" })]);
    expect(departExpedition(crafting, "a")).toBe(crafting);
    const starving = colony(5, [dwarf("a", { hungerDays: 3 })]);
    expect(departExpedition(starving, "a")).toBe(starving);
  });

  it("while away: eats but produces nothing, and the tool gives no bonus", () => {
    const next = advanceDay(colony(5, [dwarf("a", { assignment: "woodcutting", status: "expedition", hasTool: true })]));
    expect(next.resources).toMatchObject({ wood: 0, food: 4 });
    expect(next.dwarves[0].status).toBe("expedition");
  });
});
