// Split from simulation.ts: D1 hunger rules (output share, WORKING/IDLE badge, hunger messages, game over).
// WHY its own file: forge, expeditions and the day all use these rules, so they live in one place.
import type { ColonyState, Dwarf } from "../types";

// Share of normal output by days in a row without a meal (3 or more days = stops working)
export const hungerOutput = [1, 0.5, 0.3, 0];

// Split: now exported (was file-private), because forge.ts, expeditions.ts, production.ts and day.ts need it
export const outputShare = (dwarf: Dwarf) => hungerOutput[Math.min(dwarf.hungerDays ?? 0, 3)];

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

// ---------- Game over (D1 consequence) + New colony (D5) ----------

// D1 game over: true when the colony can never recover from a food shortage.
// Starved = no food left, EVERY member is 3+ days hungry
// Only if nobody is on an expedition: a dwarf who is in Goblin Warrens can still bring food home
//Pure function, so it is tested like every other rule.
export function isStarved(state: ColonyState): boolean {
  return state.resources.food === 0
    && state.dwarves.length > 0
    && state.dwarves.every((member) => hungerLevel(member) === 3 && member.status !== "expedition");
}
