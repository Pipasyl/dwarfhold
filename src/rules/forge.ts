// Split from simulation.ts: D2 recipes and tools + D3 timed crafting (+ the D6 ogre forge rules).
import type { ColonyState, Dwarf, Resources } from "../types";
import { outputShare } from "./hunger"; // Split: "too hungry to forge" uses the shared hunger share

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

// D3 chronicle: reports a finished craft by comparing the state before and after a day.
// Pure function (same idea as hungerMessages), so React can't log it twice.
export function forgeMessages(before: ColonyState, after: ColonyState) {
  if (!before.forgeJob || after.forgeJob) return [];
  const crafter = after.dwarves.find((dwarf) => dwarf.id === before.forgeJob!.dwarfId);
  return [{ text: `${crafter?.name ?? "A dwarf"} finished forging a ${before.forgeJob.recipe}.`, tone: "good" as const }];
}
