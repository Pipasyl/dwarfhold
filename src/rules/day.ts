// Split from simulation.ts: one simulation day (advanceDay) + the raid chronicle that replays it.
// WHY its own file: advanceDay is where all rules meet (production, hunger, forge, raid).
import type { ColonyState, Dwarf, Resources } from "../types";
import { recipes } from "./forge";
import { outputShare, statusFor } from "./hunger";
import { productionFor, workerOutput } from "./production";
import { resolveRaid, WEAPONS_NEEDED } from "./raids";

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

  // CHANGED (meal order): the farmers/others split is now only used for WHO EATS FIRST, not for who works first
  const farmers = dwarves.filter((dwarf) => canWork(dwarf) && dwarf.assignment === "farming");
  const others = dwarves.filter((dwarf) => !farmers.includes(dwarf));

  // 1. CHANGED: EVERYONE who can work produces first (was: only farmers before the meal, others after).
  // WHY: one simple rule for all jobs – work during the day, eat together at the end. Today's harvest
  // still feeds today's meals, and hunger lowers output from the next day on (for every job the same).
  dwarves.filter(canWork).forEach(harvest);

  // 2. Meals at the end of the day: farmers eat first, then everyone else in list order (expedition dwarves eat too)
  [...farmers, ...others].forEach((dwarf) => {
    if (resources.food > 0) {
      resources.food -= 1; // food never goes below 0
      dwarf.hungerDays = 0;
    } else {
      dwarf.hungerDays = (dwarf.hungerDays ?? 0) + 1; // one more day without a meal
    }
  });

  // CHANGED: old step 3 "other workers produce after meals" removed – they now work in step 1 with everyone else

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

  // 3c. D7 raid: one day closer. At 0 the goblins attack NOW, at the END of the day (after production
  // and the forge), so a weapon finished today already counts for the defense.
  let raid = state.raid ? { ...state.raid } : null;
  if (raid) {
    raid.daysLeft -= 1;
    if (raid.daysLeft <= 0) {
      Object.assign(resources, resolveRaid(resources)); // defend or get looted (deterministic)
      raid = null; // the raid is over
    }
  }

  // 4. Badge: WORKING until the dwarf has to stop (3 days hungry), then IDLE; expedition is left alone
  // D3: a dwarf who is still CRAFTING keeps that badge
  dwarves.forEach((dwarf) => {
    if (dwarf.status === "expedition" || dwarf.status === "crafting") return;
    dwarf.status = statusFor(dwarf); // D1 badge fix: uses the shared rule (same as assignDwarf)
  });

  return { ...state, day: state.day + 1, resources, dwarves, forgeJob, raid }; // D3: forgeJob saved with the day, D7: raid too
}

// D7 chronicle: compares before/after (same idea as forgeMessages), so Strict Mode can't log twice.
// - a raid appeared -> warning with the countdown and the weapon threshold
// - a raid ended    -> defended or looted, with the exact losses
// WHY replay the day without the raid: production, meals and the forge also change the stores that
// day. Running the same (pure) day again WITHOUT the raid gives the stores right before the attack.
// Split: kept next to advanceDay (not in raids.ts) to avoid a circular import between the two files.
export function raidMessages(before: ColonyState, after: ColonyState) {
  if (!before.raid && after.raid) {
    return [{ text: `Goblins followed the trail home! They attack in ${after.raid.daysLeft} days – the armory needs ${WEAPONS_NEEDED} weapons.`, tone: "warning" as const }];
  }
  if (!before.raid || after.raid || after.day !== before.day + 1) return [];
  const beforeAttack = advanceDay({ ...before, raid: null }).resources;
  if (beforeAttack.weapons >= WEAPONS_NEEDED) {
    return [{ text: "The goblins were driven off! One weapon broke in the fight.", tone: "good" as const }];
  }
  const losses = (["wood", "stone", "food"] as const)
    .map((key) => [key, beforeAttack[key] - after.resources[key]] as const)
    .filter(([, lost]) => lost > 0)
    .map(([key, lost]) => `−${lost} ${key}`);
  return [{
    text: losses.length ? `Goblins looted the stores: ${losses.join(", ")}.` : "Goblins found the stores empty.",
    tone: "warning" as const,
  }];
}
