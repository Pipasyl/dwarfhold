import type { Activity, ColonyState, JobType, ResourceKey, Resources } from "./types"; // D5: Activity + ResourceKey for the save check

type Dwarf = ColonyState["dwarves"][number];

export const production: Record<Exclude<JobType, null>, Partial<Resources>> = {
  woodcutting: { wood: 3 }, mining: { stone: 2 }, farming: { food: 4 },
};

// D6: the ogre's OWN production rates (same three jobs, different numbers).
// WHY: an ogre is huge and strong -> great at heavy work (wood, stone), but bad at careful mushroom farming.
export const ogreProduction: Record<Exclude<JobType, null>, Partial<Resources>> = {
  woodcutting: { wood: 5 }, mining: { stone: 4 }, farming: { food: 1 },
};

// D6: picks the right production table for a colony member (ogre table or the normal dwarf table).
// Used by advanceDay AND the Shift Ledger, so the screen always shows the real numbers.
export const productionFor = (member: { species?: "ogre" }) => (member.species === "ogre" ? ogreProduction : production);

// Share of normal output by days in a row without a meal (3 or more days = stops working)
export const hungerOutput = [1, 0.5, 0.3, 0];

const outputShare = (dwarf: Dwarf) => hungerOutput[Math.min(dwarf.hungerDays ?? 0, 3)];

// D2: output of one worker = (normal amount + 1 if they carry a tool) x hunger share, rounded.
// WHY hunger on the total: a starving dwarf is slow whatever they hold, and 3+ hungry days still means 0.
// Exported so the Shift Ledger uses exactly the same formula as the simulation.
export const workerOutput = (dwarf: Dwarf, amount: number) =>
  Math.round((amount + (dwarf.hasTool ? 1 : 0)) * outputShare(dwarf));

// D2: forge recipes in one place, so the forge page, the check and the tests all use the same costs.
// Weapon = 2 wood + 4 stone: costs more than a tool and leans on stone (mining/expeditions matter).
// D3: "days" = how many simulation days the crafting takes (same 8 s day clock as production,
// so the Pause button also pauses the forge). A weapon takes longer because it costs more.
export const recipes = {
  tool: { cost: { wood: 3, stone: 2 }, result: "tools", days: 1 },
  weapon: { cost: { wood: 2, stone: 4 }, result: "weapons", days: 2 },
} as const;
export type RecipeId = keyof typeof recipes;

// D6: how many days a craft takes for THIS smith. Ogre ability: a weapon takes only 1 day
// (raw strength at the anvil). Everyone else uses the normal recipe time.
export const craftDays = (smith: Dwarf | undefined, recipe: RecipeId): number =>
  smith?.species === "ogre" && recipe === "weapon" ? 1 : recipes[recipe].days;

// D2: true only if the stock has EVERY material of the recipe.
// WHY: the starter only checked wood, so stone could go negative.
export const canCraft = (resources: Resources, recipe: RecipeId) =>
  Object.entries(recipes[recipe].cost).every(([key, amount]) => resources[key as keyof Resources] >= amount);

// D3: returns WHY a craft cannot start (text for the chronicle), or null if it can start.
// Eligible = present, not already crafting, and able to work (not 3+ days hungry).
// One forge = one craft at a time. Materials are checked last, after the dwarf.
export function craftProblem(state: ColonyState, recipe: RecipeId, dwarfId: string): string | null {
  const dwarf = state.dwarves.find((item) => item.id === dwarfId);
  if (!dwarf) return "Choose a dwarf to work the forge.";
  if (state.forgeJob) return "The forge is already in use.";
  if (dwarf.status === "expedition") return `${dwarf.name} is away and cannot work the forge.`;
  if (outputShare(dwarf) === 0) return `${dwarf.name} is too hungry to work the forge.`;
  // D6: ogre limitation: huge hands are too clumsy for fine tool work. Checked before materials,
  // so the player learns the real reason (the ogre can never do it, even with enough materials).
  if (dwarf.species === "ogre" && recipe === "tool") return `${dwarf.name}'s huge hands are too clumsy to forge a tool.`;
  if (!canCraft(state.resources, recipe)) {
    const { wood, stone } = recipes[recipe].cost;
    return `The forge needs ${wood} wood and ${stone} stone for a ${recipe}.`;
  }
  return null;
}

// D3: STARTS crafting (replaces the instant D2 craft). Materials are taken now, so they can't be
// spent twice while the item is being made. The dwarf keeps their job but becomes CRAFTING.
// An invalid attempt returns the SAME state, so neither workers nor resources change.
export function startCraft(state: ColonyState, recipe: RecipeId, dwarfId: string): ColonyState {
  if (craftProblem(state, recipe, dwarfId)) return state;
  const resources = { ...state.resources };
  Object.entries(recipes[recipe].cost).forEach(([key, amount]) => {
    resources[key as keyof Resources] -= amount;
  });
  return {
    ...state,
    resources,
    dwarves: state.dwarves.map((item) => (item.id === dwarfId ? { ...item, status: "crafting" } : item)),
    // D6: days come from craftDays, so an ogre's weapon takes 1 day instead of 2
    forgeJob: { dwarfId, recipe, daysLeft: craftDays(state.dwarves.find((item) => item.id === dwarfId), recipe) },
  };
}

// D2: equip a free tool, or return the dwarf's tool to storage.
// Free tools + equipped tools always stay the same total. Invalid cases return the SAME state:
// dwarf away (D4 decides tools on expeditions), unknown dwarf, or no free tool to equip.
export function toggleTool(state: ColonyState, dwarfId: string): ColonyState {
  const dwarf = state.dwarves.find((item) => item.id === dwarfId);
  // D3: also locked while CRAFTING, so the crafter's equipment can't change mid-task
  if (!dwarf || dwarf.status === "expedition" || dwarf.status === "crafting") return state;
  if (!dwarf.hasTool && state.resources.tools < 1) return state;
  return {
    ...state,
    resources: { ...state.resources, tools: state.resources.tools + (dwarf.hasTool ? 1 : -1) },
    dwarves: state.dwarves.map((item) => (item.id === dwarfId ? { ...item, hasTool: !item.hasTool } : item)),
  };
}

// D1 badge fix: ONE shared rule for the WORKING/IDLE badge.
// WHY: before, assigning a job always showed WORKING, even for a dwarf who is 3+ days hungry
// and produces nothing. Now every place that sets the badge asks this function.
export const statusFor = (dwarf: Dwarf): "working" | "idle" =>
  dwarf.assignment && outputShare(dwarf) > 0 ? "working" : "idle";

// D1 chronicle: hunger level = 0 fed, 1 hungry (50%), 2 weak (30%), 3 stopped working.
// WHY: we only log when the LEVEL changes, so the chronicle is not flooded with the same line every day.
const hungerLevel = (dwarf: Dwarf) => Math.min(dwarf.hungerDays ?? 0, 3);

// D1 chronicle: compares the dwarves before and after a day and returns one message per level change.
// WHY a separate pure function: it has no side effects, so it is easy to test and React can't run it twice by accident.
export function hungerMessages(before: Dwarf[], after: Dwarf[]) {
  const messages: { text: string; tone: "good" | "warning" }[] = [];
  after.forEach((dwarf) => {
    const old = before.find((item) => item.id === dwarf.id);
    if (!old) return;
    const from = hungerLevel(old);
    const to = hungerLevel(dwarf);
    if (from === to) return; // same level as yesterday -> nothing new to report

    if (to === 0) messages.push({ text: `${dwarf.name} eats again – back to full output.`, tone: "good" });
    else if (to === 1) messages.push({ text: `${dwarf.name} goes hungry – 50% output.`, tone: "warning" });
    else if (to === 2) messages.push({ text: `${dwarf.name} weakens from hunger – 30% output.`, tone: "warning" });
    else messages.push({ text: `${dwarf.name} is too hungry to work.`, tone: "warning" });
  });
  return messages;
}

export function advanceDay(state: ColonyState): ColonyState {
  const resources = { ...state.resources };
  // Copy the dwarves so the old state is never changed (React needs a new object to re-render)
  const dwarves = state.dwarves.map((dwarf) => ({ ...dwarf }));

  // A dwarf on an expedition is away and cannot do daily work
  // D3: a CRAFTING dwarf is at the forge, so they don't do their normal job either (one activity per dwarf)
  const canWork = (dwarf: Dwarf) =>
    Boolean(dwarf.assignment) && dwarf.status !== "expedition" && dwarf.status !== "crafting";

  // Adds the dwarf's daily output (D2: +1 with a tool), reduced by hunger and rounded to whole numbers
  const harvest = (dwarf: Dwarf) => {
    if (!dwarf.assignment) return;
    // D6: productionFor instead of production, so the ogre uses its own production table
    Object.entries(productionFor(dwarf)[dwarf.assignment]).forEach(([resource, amount]) => {
      resources[resource as keyof Resources] += workerOutput(dwarf, amount ?? 0); // D2: tool bonus + hunger via shared formula
    });
  };

  const farmers = dwarves.filter((dwarf) => canWork(dwarf) && dwarf.assignment === "farming");
  const others = dwarves.filter((dwarf) => !farmers.includes(dwarf));

  // 1. Farmers harvest first, so the new food is available for today's meals
  farmers.forEach(harvest);

  // 2. Meals: farmers eat first, then everyone else in list order (expedition dwarves eat too)
  [...farmers, ...others].forEach((dwarf) => {
    if (resources.food > 0) {
      resources.food -= 1; // food never goes below 0
      dwarf.hungerDays = 0;
    } else {
      dwarf.hungerDays = (dwarf.hungerDays ?? 0) + 1; // one more day without a meal
    }
  });

  // 3. Other workers produce after meals, so today's hunger already counts
  others.filter(canWork).forEach(harvest);

  // 3b. D3 forge: one more day of work, but only if the crafter can work today (after meals,
  // so today's hunger counts). 3+ hungry days = the craft PAUSES until the dwarf eats (D1 rule).
  let forgeJob = state.forgeJob ? { ...state.forgeJob } : null;
  if (forgeJob) {
    const crafter = dwarves.find((dwarf) => dwarf.id === forgeJob!.dwarfId);
    if (crafter && outputShare(crafter) > 0) forgeJob.daysLeft -= 1;
    if (forgeJob.daysLeft <= 0) {
      resources[recipes[forgeJob.recipe].result] += 1; // finished item goes into the stock exactly once
      if (crafter) crafter.status = statusFor(crafter); // back to their own job automatically
      forgeJob = null; // forge is free again
    }
  }

  // 4. Badge: WORKING until the dwarf has to stop (3 days hungry), then IDLE; expedition is left alone
  // D3: a dwarf who is still CRAFTING keeps that badge
  dwarves.forEach((dwarf) => {
    if (dwarf.status === "expedition" || dwarf.status === "crafting") return;
    dwarf.status = statusFor(dwarf); // D1 badge fix: uses the shared rule (same as assignDwarf)
  });

  return { ...state, day: state.day + 1, resources, dwarves, forgeJob }; // D3: forgeJob saved with the day
}

// D4: returns WHY a dwarf cannot leave, or null if they can.
// Eligible = present and able to work: not away, not crafting, not 3+ days hungry (same rule as the forge).
export function expeditionProblem(state: ColonyState, dwarfId: string): string | null {
  const dwarf = state.dwarves.find((item) => item.id === dwarfId);
  if (!dwarf) return "Choose a dwarf for the expedition.";
  if (dwarf.status === "expedition") return `${dwarf.name} is already beyond the gate.`;
  if (dwarf.status === "crafting") return `${dwarf.name} is busy at the forge.`;
  if (outputShare(dwarf) === 0) return `${dwarf.name} is too hungry to travel.`;
  return null;
}

// D4: marks the dwarf as away. The tool (if any) stays equipped and travels with them:
// the stock doesn't move, so no tool can be lost or duplicated. Invalid -> SAME state.
export function departExpedition(state: ColonyState, dwarfId: string): ColonyState {
  if (expeditionProblem(state, dwarfId)) return state;
  return {
    ...state,
    dwarves: state.dwarves.map((item) => (item.id === dwarfId ? { ...item, status: "expedition" } : item)),
  };
}

// D4: brings the dwarf back and adds the rewards (failure = empty rewards).
// "Exactly once": only works while the dwarf is still away. A second call finds them already home
// and returns the SAME state, so rewards can never be added twice.
export function returnFromExpedition(state: ColonyState, dwarfId: string, rewards: Partial<Resources>): ColonyState {
  const dwarf = state.dwarves.find((item) => item.id === dwarfId);
  if (!dwarf || dwarf.status !== "expedition") return state;
  const resources = { ...state.resources };
  Object.entries(rewards).forEach(([key, amount]) => {
    resources[key as keyof Resources] += amount ?? 0;
  });
  return {
    ...state,
    resources,
    // back to their own job (or IDLE if hungry / unassigned), same shared badge rule as everywhere
    dwarves: state.dwarves.map((item) => (item.id === dwarfId ? { ...item, status: statusFor(item) } : item)),
  };
}

// ---------- D6: new species (ogre) ----------

// D6: the destination our team chose. The ogre was trapped in the Old Mine.
export const OGRE_DESTINATION = "old-mine";

// D6: the ogre who joins. Arrives unassigned and idle, so the player decides the job.
export const ogreRecruit: Dwarf = {
  id: "ogre-1", name: "Grukk Stonefist", title: "Mountain Ogre", icon: "🧌",
  assignment: null, status: "idle", species: "ogre",
};

// D6: called ONLY after a SUCCESSFUL expedition (failures never reach it).
// The ogre joins if the destination is the Old Mine AND no ogre is in the colony yet.
// "Exactly once": the second success finds the ogre already there and returns the SAME state.
// WHY no extra "joined" flag: the roster itself is the proof, so the two can never disagree.
export function joinAfterExpedition(state: ColonyState, destination: string): ColonyState {
  if (destination !== OGRE_DESTINATION) return state;
  if (state.dwarves.some((member) => member.species === "ogre")) return state;
  return { ...state, dwarves: [...state.dwarves, { ...ogreRecruit }] };
}

// D6 chronicle: compares before/after (same idea as hungerMessages), so React Strict Mode
// can't write the "joined" message twice.
export function joinMessages(before: Dwarf[], after: Dwarf[]) {
  return after
    .filter((member) => !before.some((old) => old.id === member.id))
    .map((member) => ({
      text: `${member.name}, a ${member.title.toLowerCase()} trapped in the Old Mine, joins Stonehome!`,
      tone: "good" as const,
    }));
}

// D3 chronicle: reports a finished craft by comparing the state before and after a day.
// Pure function (same idea as hungerMessages), so React can't log it twice.
export function forgeMessages(before: ColonyState, after: ColonyState) {
  if (!before.forgeJob || after.forgeJob) return [];
  const crafter = after.dwarves.find((dwarf) => dwarf.id === before.forgeJob!.dwarfId);
  return [{ text: `${crafter?.name ?? "A dwarf"} finished forging a ${before.forgeJob.recipe}.`, tone: "good" as const }];
}

export const jobLabel = (job: JobType) => job ? ({ 
  woodcutting: "Woodcutting", 
  mining: "Deep Mining", 
  farming: "Mushroom Farm" 
}[job]) : "Unassigned";
// ---------- D5: save and restore ----------

// D5: raise this number whenever the save shape changes. WHY: an old save with a different
// shape is then recognized as "incompatible" and replaced, instead of crashing the game.
export const SAVE_VERSION = 1;
export interface SaveData { version: number; colony: ColonyState; activities: Activity[] }

// D5: small checks for data that comes from outside (localStorage can be edited or broken)
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isCount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;
const isText = (value: unknown) => typeof value === "string";
const jobs: JobType[] = [null, "woodcutting", "mining", "farming"];
const statuses = ["idle", "working", "expedition", "crafting"];
const resourceKeys: ResourceKey[] = ["wood", "stone", "food", "tools", "weapons"];

// D5: a saved dwarf must have every required field with a valid value
function isDwarf(value: unknown): value is Dwarf {
  return isObject(value) && isText(value.id) && isText(value.name) && isText(value.title) && isText(value.icon)
    && jobs.includes(value.assignment as JobType) && statuses.includes(value.status as string)
    && (value.specialty === undefined || (value.specialty !== null && jobs.includes(value.specialty as JobType)))
    && (value.hungerDays === undefined || isCount(value.hungerDays))
    && (value.hasTool === undefined || typeof value.hasTool === "boolean")
    && (value.species === undefined || value.species === "ogre"); // D6: only "no species" (dwarf) or "ogre" is valid
}

function isActivity(value: unknown): value is Activity {
  return isObject(value) && isText(value.id) && typeof value.day === "number" && isText(value.message)
    && (value.tone === undefined || value.tone === "good" || value.tone === "warning");
}

// D5: reads a save text. Returns null for "no save" AND for corrupt/incompatible data.
// WHY the whole save is rejected (no repair of single fields): a half-repaired save could create
// impossible states, e.g. a crafting dwarf without a forge job (stuck forever).
export function parseSave(text: string | null): SaveData | null {
  if (text === null) return null;
  let data: unknown;
  try {
    data = JSON.parse(text); // D5: broken JSON throws -> corrupt
  } catch {
    return null;
  }
  if (!isObject(data) || data.version !== SAVE_VERSION) return null; // wrong version = incompatible
  const { colony, activities } = data;
  if (!isObject(colony) || !Number.isInteger(colony.day) || (colony.day as number) < 1) return null;
  const resources = colony.resources;
  if (!isObject(resources) || !resourceKeys.every((key) => isCount(resources[key]))) return null; // no missing/negative resource
  if (!Array.isArray(colony.dwarves) || !colony.dwarves.every(isDwarf)) return null;
  const dwarves = colony.dwarves as Dwarf[];
  if (new Set(dwarves.map((dwarf) => dwarf.id)).size !== dwarves.length) return null; // ids must be unique
  const job = colony.forgeJob ?? null;
  if (job !== null && !(isObject(job) && (job.recipe === "tool" || job.recipe === "weapon")
    && Number.isInteger(job.daysLeft) && (job.daysLeft as number) >= 1)) return null;
  // D5: forge job and CRAFTING badge must match (the crafter exists and is the only crafting dwarf)
  const crafters = dwarves.filter((dwarf) => dwarf.status === "crafting").map((dwarf) => dwarf.id);
  if (crafters.join() !== (job ? [job.dwarfId] : []).join()) return null;
  if (!Array.isArray(activities) || !activities.every(isActivity)) return null;
  return { version: SAVE_VERSION, colony: colony as unknown as ColonyState, activities: (activities as Activity[]).slice(0, 6) };
}

// D5: refresh policy, applied once right after loading a save.
// Expedition: the request died with the page and the server keeps nothing -> dwarf comes home,
// no rewards, keeps their tool (same rule as a D4 failure; re-sending could pay twice).
// Forge: the job is saved with daysLeft and materials were already paid -> it simply continues.
export function restoreAfterRefresh(state: ColonyState) {
  let colony = state;
  const messages: { text: string; tone?: "good" | "warning" }[] = [];
  state.dwarves.filter((dwarf) => dwarf.status === "expedition").forEach((dwarf) => {
    colony = returnFromExpedition(colony, dwarf.id, {});
    messages.push({ text: `Contact with ${dwarf.name}'s expedition was lost when the hold was refreshed – ${dwarf.name} returned empty-handed.`, tone: "warning" });
  });
  const job = state.forgeJob;
  if (job) {
    const crafter = state.dwarves.find((dwarf) => dwarf.id === job.dwarfId);
    messages.push({ text: `${crafter?.name} resumes forging a ${job.recipe} (${job.daysLeft} day${job.daysLeft > 1 ? "s" : ""} left).` });
  }
  return { colony, messages };
}
