import type { ColonyState, JobType, Resources } from "./types";

type Dwarf = ColonyState["dwarves"][number];

export const production: Record<Exclude<JobType, null>, Partial<Resources>> = {
  woodcutting: { wood: 3 }, mining: { stone: 2 }, farming: { food: 4 },
};

// Share of normal output by days in a row without a meal (3 or more days = stops working)
export const hungerOutput = [1, 0.5, 0.3, 0];

const outputShare = (dwarf: Dwarf) => hungerOutput[Math.min(dwarf.hungerDays ?? 0, 3)];

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
    dwarf.status = statusFor(dwarf); // D1 badge fix: uses the shared rule (same as assignDwarf)
  });

  return { ...state, day: state.day + 1, resources, dwarves };
}

export const jobLabel = (job: JobType) => job ? ({ 
  woodcutting: "Woodcutting", 
  mining: "Deep Mining", 
  farming: "Mushroom Farm" 
}[job]) : "Unassigned";