// Split from simulation.ts: what daily work produces (dwarf and ogre tables, tool bonus, job names).
import type { Dwarf, JobType, Resources } from "../types";
import { outputShare } from "./hunger"; // Split: the hunger share now comes from hunger.ts

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

// D2: output of one worker = (normal amount + 1 if they carry a tool) x hunger share, rounded.
// WHY hunger on the total: a starving dwarf is slow whatever they hold, and 3+ hungry days still means 0.
// Exported so the Shift Ledger uses exactly the same formula as the simulation.
export const workerOutput = (dwarf: Dwarf, amount: number) =>
  Math.round((amount + (dwarf.hasTool ? 1 : 0)) * outputShare(dwarf));

export const jobLabel = (job: JobType) => job ? ({
  woodcutting: "Woodcutting",
  mining: "Deep Mining",
  farming: "Mushroom Farm"
}[job]) : "Unassigned";
