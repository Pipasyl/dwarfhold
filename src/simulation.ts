import type { ColonyState, JobType, Resources } from "./types";

type Dwarf = ColonyState["dwarves"][number];

export const production: Record<Exclude<JobType, null>, Partial<Resources>> = {
  woodcutting: { wood: 3 }, mining: { stone: 2 }, farming: { food: 4 },
};

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
export const recipes = {
  tool: { cost: { wood: 3, stone: 2 }, result: "tools" },
  weapon: { cost: { wood: 2, stone: 4 }, result: "weapons" },
} as const;
export type RecipeId = keyof typeof recipes;

// D2: true only if the stock has EVERY material of the recipe.
// WHY: the starter only checked wood, so stone could go negative.
export const canCraft = (resources: Resources, recipe: RecipeId) =>
  Object.entries(recipes[recipe].cost).every(([key, amount]) => resources[key as keyof Resources] >= amount);

// D2: crafts one item. An invalid attempt returns the SAME state, so nothing changes.
export function craft(state: ColonyState, recipe: RecipeId): ColonyState {
  if (!canCraft(state.resources, recipe)) return state;
  const resources = { ...state.resources };
  Object.entries(recipes[recipe].cost).forEach(([key, amount]) => {
    resources[key as keyof Resources] -= amount;
  });
  resources[recipes[recipe].result] += 1;
  return { ...state, resources };
}

// D2: equip a free tool, or return the dwarf's tool to storage.
// Free tools + equipped tools always stay the same total. Invalid cases return the SAME state:
// dwarf away (D4 decides tools on expeditions), unknown dwarf, or no free tool to equip.
export function toggleTool(state: ColonyState, dwarfId: string): ColonyState {
  const dwarf = state.dwarves.find((item) => item.id === dwarfId);
  if (!dwarf || dwarf.status === "expedition") return state;
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
  const canWork = (dwarf: Dwarf) => Boolean(dwarf.assignment) && dwarf.status !== "expedition";

  // Adds the dwarf's daily output (D2: +1 with a tool), reduced by hunger and rounded to whole numbers
  const harvest = (dwarf: Dwarf) => {
    if (!dwarf.assignment) return;
    Object.entries(production[dwarf.assignment]).forEach(([resource, amount]) => {
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

  // 4. Badge: WORKING until the dwarf has to stop (3 days hungry), then IDLE; expedition is left alone
  dwarves.forEach((dwarf) => {
    if (dwarf.status === "expedition") return;
    dwarf.status = statusFor(dwarf); // D1 badge fix: uses the shared rule (same as assignDwarf)
  });

  return { ...state, day: state.day + 1, resources, dwarves };
}

export const jobLabel = (job: JobType) => job ? ({ 
  woodcutting: "Woodcutting", 
  mining: "Deep Mining", 
  farming: "Mushroom Farm" 
}[job]) : "Unassigned";