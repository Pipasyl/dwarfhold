import { describe, expect, it } from "vitest";
import { advanceDay, raidAfterExpedition, raidMessages, resolveRaid, craftProblem, departExpedition, joinAfterExpedition, joinMessages, ogreRecruit, forgeMessages, hungerMessages, parseSave, restoreAfterRefresh, returnFromExpedition, SAVE_VERSION, startCraft, statusFor, toggleTool } from "./simulation"; // D1: hungerMessages + statusFor, D2: toggleTool, D3: startCraft + forgeMessages (instant craft removed), D4: departExpedition + returnFromExpedition, D5: parseSave + restoreAfterRefresh + SAVE_VERSION, D6: craftProblem + joinAfterExpedition + joinMessages + ogreRecruit, D7: raidAfterExpedition + raidMessages + resolveRaid
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

// ---------- D5 tests: save/restore and the refresh policy ----------
describe("D5 save and restore", () => {
  // helper: the text autosave would write for this colony
  const saveText = (state: ColonyState, version = SAVE_VERSION) =>
    JSON.stringify({ version, colony: state, activities: [{ id: "x", day: 1, message: "hi" }] });

  it("a valid save is restored unchanged", () => {
    const state = colony(5, [dwarf("a", { assignment: "mining", status: "working", hasTool: true, hungerDays: 1 })]);
    expect(parseSave(saveText(state))).toEqual({ version: SAVE_VERSION, colony: state, activities: [{ id: "x", day: 1, message: "hi" }] });
  });

  it("no save, broken JSON or wrong version -> null (fallback to a new colony)", () => {
    expect(parseSave(null)).toBeNull();
    expect(parseSave("{not json")).toBeNull();
    expect(parseSave(saveText(colony(5, [dwarf("a")]), 99))).toBeNull();
  });

  it("missing or negative resources, or a broken dwarf -> null", () => {
    expect(parseSave(saveText(colony(-1, [dwarf("a")])))).toBeNull();
    const noWeapons = colony(5, [dwarf("a")]) as unknown as { resources: Record<string, number> };
    delete noWeapons.resources.weapons;
    expect(parseSave(JSON.stringify({ version: SAVE_VERSION, colony: noWeapons, activities: [] }))).toBeNull();
    expect(parseSave(saveText(colony(5, [dwarf("a", { status: "flying" as never })])))).toBeNull();
  });

  it("crafting dwarf without a forge job (would be stuck) -> null", () => {
    expect(parseSave(saveText(colony(5, [dwarf("a", { status: "crafting" })])))).toBeNull();
  });

  it("refresh during an expedition: dwarf comes home with no rewards and keeps the tool", () => {
    const away = colony(5, [dwarf("a", { assignment: "mining", status: "expedition", hasTool: true })]);
    const { colony: after, messages } = restoreAfterRefresh(away);
    expect(after.dwarves[0]).toMatchObject({ status: "working", hasTool: true });
    expect(after.resources).toEqual(away.resources);
    expect(messages[0].tone).toBe("warning");
  });

  it("refresh during a forge job: the job continues unchanged", () => {
    const forging = { ...colony(5, [dwarf("a", { status: "crafting" })]), forgeJob: { dwarfId: "a", recipe: "weapon" as const, daysLeft: 2 } };
    expect(parseSave(saveText(forging))?.colony.forgeJob).toEqual({ dwarfId: "a", recipe: "weapon", daysLeft: 2 });
    const { colony: after, messages } = restoreAfterRefresh(forging);
    expect(after).toBe(forging);
    expect(messages[0].text).toContain("2 days left");
  });
});

// ---------- D6 tests: new species (ogre) ----------
describe("D6 ogre species", () => {
  const ogre = (extra: Partial<Dwarf> = {}): Dwarf => ({ ...ogreRecruit, ...extra });
  const rich = (dwarves: Dwarf[]): ColonyState => ({
    day: 1, resources: { wood: 20, stone: 20, food: 20, tools: 0, weapons: 0 }, dwarves,
  });

  it("joins after the first successful Old Mine expedition, unassigned and idle", () => {
    const next = joinAfterExpedition(rich([dwarf("a")]), "old-mine");
    expect(next.dwarves).toHaveLength(2);
    expect(next.dwarves[1]).toMatchObject({ species: "ogre", assignment: null, status: "idle" });
    expect(joinMessages([dwarf("a")], next.dwarves)[0].text).toContain("joins Stonehome");
  });

  it("joins only once and never from another destination", () => {
    const once = joinAfterExpedition(rich([dwarf("a")]), "old-mine");
    expect(joinAfterExpedition(once, "old-mine")).toBe(once); // second success: SAME state
    const other = rich([dwarf("a")]);
    expect(joinAfterExpedition(other, "crystal-cave")).toBe(other);
  });

  it("a failed expedition brings no ogre (failure path never calls the join)", () => {
    const away = departExpedition(rich([dwarf("a")]), "a");
    const back = returnFromExpedition(away, "a", {}); // D4 failure path
    expect(back.dwarves.some((d) => d.species === "ogre")).toBe(false);
  });

  it("ogre has its own production: wood 5, stone 4, food 1", () => {
    const out = (job: "woodcutting" | "mining" | "farming") =>
      advanceDay({ ...rich([ogre({ assignment: job, status: "working" })]), resources: { wood: 0, stone: 0, food: 1, tools: 0, weapons: 0 } }).resources;
    expect(out("woodcutting").wood).toBe(5);
    expect(out("mining").stone).toBe(4);
    expect(out("farming").food).toBe(1); // harvests 1, eats 1 -> 1 left
  });

  it("ogre cannot forge tools (state unchanged) but forges a weapon in 1 day", () => {
    const state = rich([ogre()]);
    expect(craftProblem(state, "tool", "ogre-1")).toContain("too clumsy");
    expect(startCraft(state, "tool", "ogre-1")).toBe(state);
    const crafting = startCraft(state, "weapon", "ogre-1");
    expect(crafting.forgeJob?.daysLeft).toBe(1);
    expect(advanceDay(crafting).resources.weapons).toBe(1);
  });

  it("save: a colony with the ogre loads, an unknown species is rejected", () => {
    const save = (dwarves: unknown[]) => JSON.stringify({ version: SAVE_VERSION, colony: { ...rich([]), dwarves }, activities: [] });
    expect(parseSave(save([ogre()]))).not.toBeNull();
    expect(parseSave(save([{ ...ogre(), species: "elf" }]))).toBeNull();
  });
});

// ---------- D7 tests: expedition consequences and defense ----------
describe("D7 goblin raids", () => {
  const stores = (extra: Partial<ColonyState["resources"]> = {}) => ({ wood: 15, stone: 9, food: 20, tools: 1, weapons: 0, ...extra });
  const base = (extra: Partial<ColonyState> = {}): ColonyState => ({ day: 1, resources: stores(), dwarves: [], ...extra });

  it("a Goblin Warrens success sets a raid in 2 days, other destinations don't", () => {
    expect(raidAfterExpedition(base(), "goblin-warrens").raid).toEqual({ daysLeft: 2 });
    const state = base();
    expect(raidAfterExpedition(state, "old-mine")).toBe(state);
  });

  it("a failed request never starts a raid (failure path only returns the dwarf)", () => {
    const away = departExpedition(base({ dwarves: [dwarf("a")] }), "a");
    expect(returnFromExpedition(away, "a", {}).raid).toBeUndefined();
  });

  it("only one raid at a time: a second success changes nothing", () => {
    const coming = base({ raid: { daysLeft: 1 } });
    expect(raidAfterExpedition(coming, "goblin-warrens")).toBe(coming);
  });

  it("counts down and attacks at 0", () => {
    const day1 = advanceDay(base({ raid: { daysLeft: 2 } }));
    expect(day1.raid).toEqual({ daysLeft: 1 });
    expect(advanceDay(day1).raid).toBeNull();
  });

  it("2 weapons defend (1 breaks), fewer weapons = half of wood/stone/food looted (rounded down)", () => {
    expect(resolveRaid(stores({ weapons: 2 }))).toEqual(stores({ weapons: 1 }));
    expect(resolveRaid(stores({ weapons: 1 }))).toEqual(stores({ wood: 8, stone: 5, food: 10, weapons: 1 }));
  });

  it("a weapon finished on the attack day counts for the defense", () => {
    const smith = dwarf("s", { status: "crafting" });
    const state = base({ dwarves: [smith], resources: stores({ weapons: 1 }), forgeJob: { dwarfId: "s", recipe: "weapon", daysLeft: 1 }, raid: { daysLeft: 1 } });
    const next = advanceDay(state);
    expect(next.resources.weapons).toBe(1); // 1 + 1 forged - 1 broken
    expect(next.resources.wood).toBe(15); // nothing looted
    expect(raidMessages(state, next)[0].tone).toBe("good");
  });

  it("chronicle: warning when the raid appears, exact losses after looting", () => {
    expect(raidMessages(base(), base({ raid: { daysLeft: 2 } }))[0].text).toContain("attack in 2 days");
    const state = base({ raid: { daysLeft: 1 } });
    expect(raidMessages(state, advanceDay(state))[0].text).toContain("−7 wood");
  });

  it("save: a raid loads, a broken raid value is rejected", () => {
    const save = (raid: unknown) => JSON.stringify({ version: SAVE_VERSION, colony: { ...base(), raid }, activities: [] });
    expect(parseSave(save({ daysLeft: 2 }))).not.toBeNull();
    expect(parseSave(save({ daysLeft: 9 }))).toBeNull();
  });
});
