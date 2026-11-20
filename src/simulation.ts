import type { ColonyState, JobType, Resources } from "./types";

type Dwarf = ColonyState["dwarves"][number];

export const production: Record<Exclude<JobType, null>, Partial<Resources>> = {
  woodcutting: { wood: 3 }, mining: { stone: 2 }, farming: { food: 4 },
};

// Share of normal output by days in a row without a meal (3 or more days = stops working)
export const hungerOutput = [1, 0.5, 0.3, 0];

const outputShare = (dwarf: Dwarf) => hungerOutput[Math.min(dwarf.hungerDays ?? 0, 3)];

export function advanceDay(state: ColonyState): ColonyState {
  const resources = { ...state.resources };
  // Copy the dwarves so the old state is never changed (React needs a new object to re-render)
  const dwarves = state.dwarves.map((dwarf) => ({ ...dwarf }));

  // A dwarf on an expedition is away and cannot do daily work
  const canWork = (dwarf: Dwarf) => Boolean(dwarf.assignment) && dwarf.status !== "expedition";

  // Adds the dwarf's daily output, reduced by hunger and rounded to whole numbers
  const harvest = (dwarf: Dwarf) => {
    if (!dwarf.assignment) return;
    Object.entries(production[dwarf.assignment]).forEach(([resource, amount]) => {
      resources[resource as keyof Resources] += Math.round((amount ?? 0) * outputShare(dwarf));
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
    dwarf.status = dwarf.assignment && outputShare(dwarf) > 0 ? "working" : "idle";
  });

  return { ...state, day: state.day + 1, resources, dwarves };
}

export const jobLabel = (job: JobType) => job ? ({ 
  woodcutting: "Woodcutting", 
  mining: "Deep Mining", 
  farming: "Mushroom Farm" 
}[job]) : "Unassigned";