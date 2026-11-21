// Split from simulation.ts: D7 goblin raids (trigger, numbers, the attack itself).
// (raidMessages lives in day.ts, because it replays advanceDay; keeping it here would make
// raids.ts and day.ts import each other = a circular import.)
import type { ColonyState, Resources } from "../types";

// ---------- D7: expedition consequences and defense ----------

// D7: the NEW destination that triggers an attack, and the team's numbers
export const RAID_DESTINATION = "goblin-warrens";
export const RAID_DELAY = 2; // days of warning, so the player can still forge a weapon
export const WEAPONS_NEEDED = 2; // armory threshold: this many weapons or more = the colony defends

// D7: called ONLY after a SUCCESSFUL expedition (same spot as the D6 join), so a failed request
// never starts a raid. Only one raid at a time: if one is already coming, the SAME state is returned.
export function raidAfterExpedition(state: ColonyState, destination: string): ColonyState {
  if (destination !== RAID_DESTINATION || state.raid) return state;
  return { ...state, raid: { daysLeft: RAID_DELAY } };
}

// D7: the attack itself. Pure and deterministic (no randomness): same stores in = same result out.
// Enough weapons -> defended, 1 weapon breaks (so weapons keep mattering).
// Not enough -> goblins take HALF (rounded down) of wood, stone and food. Tools and weapons are guarded.
export function resolveRaid(resources: Resources): Resources {
  if (resources.weapons >= WEAPONS_NEEDED) return { ...resources, weapons: resources.weapons - 1 };
  const keep = (amount: number) => amount - Math.floor(amount / 2); // e.g. 15 -> 7 stolen, 8 kept
  return { ...resources, wood: keep(resources.wood), stone: keep(resources.stone), food: keep(resources.food) };
}
