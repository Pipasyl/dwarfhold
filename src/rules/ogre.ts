// Split from simulation.ts: D6 new species (who the ogre is, when it joins, its chronicle message).
// (The ogre's production table is in production.ts, its forge rules in forge.ts.)
import type { ColonyState, Dwarf } from "../types";

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
