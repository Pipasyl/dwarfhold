// Split from simulation.ts: D4 resilient expeditions (who may leave, departure, return with rewards exactly once).
import type { ColonyState, Resources } from "../types";
import { outputShare, statusFor } from "./hunger"; // Split: hunger check + shared badge rule come from hunger.ts

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
