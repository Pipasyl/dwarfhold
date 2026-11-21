// Split from simulation.ts: D5 save and restore (save format, checks for broken data, refresh policy).
import type { Activity, ColonyState, Dwarf, JobType, ResourceKey } from "../types";
import { returnFromExpedition } from "./expeditions"; // Split: refresh policy brings expedition dwarves home
import { RAID_DELAY } from "./raids"; // Split: a saved raid countdown may be at most RAID_DELAY

// ---------- D5: save and restore ----------

// D5: raise this number whenever the save shape changes. WHY: an old save with a different
// shape is then recognized as "incompatible" and replaced, instead of crashing the game.
export const SAVE_VERSION = 1;
export interface SaveData { version: number; colony: ColonyState; activities: Activity[] }

// D5: small checks for data that comes from outside (localStorage can be edited or broken)
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isCount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;
const isText = (value: unknown) => typeof value === "string";
const jobs: JobType[] = [null, "woodcutting", "mining", "farming"];
const statuses = ["idle", "working", "expedition", "crafting"];
const resourceKeys: ResourceKey[] = ["wood", "stone", "food", "tools", "weapons"];

// D5: a saved dwarf must have every required field with a valid value
function isDwarf(value: unknown): value is Dwarf {
  return isObject(value) && isText(value.id) && isText(value.name) && isText(value.title) && isText(value.icon)
    && jobs.includes(value.assignment as JobType) && statuses.includes(value.status as string)
    && (value.specialty === undefined || (value.specialty !== null && jobs.includes(value.specialty as JobType)))
    && (value.hungerDays === undefined || isCount(value.hungerDays))
    && (value.hasTool === undefined || typeof value.hasTool === "boolean")
    && (value.species === undefined || value.species === "ogre"); // D6: only "no species" (dwarf) or "ogre" is valid
}

function isActivity(value: unknown): value is Activity {
  return isObject(value) && isText(value.id) && typeof value.day === "number" && isText(value.message)
    && (value.tone === undefined || value.tone === "good" || value.tone === "warning");
}

// D5: reads a save text. Returns null for "no save" AND for corrupt/incompatible data.
// WHY the whole save is rejected (no repair of single fields): a half-repaired save could create
// impossible states, e.g. a crafting dwarf without a forge job (stuck forever).
export function parseSave(text: string | null): SaveData | null {
  if (text === null) return null;
  let data: unknown;
  try {
    data = JSON.parse(text); // D5: broken JSON throws -> corrupt
  } catch {
    return null;
  }
  if (!isObject(data) || data.version !== SAVE_VERSION) return null; // wrong version = incompatible
  const { colony, activities } = data;
  if (!isObject(colony) || !Number.isInteger(colony.day) || (colony.day as number) < 1) return null;
  const resources = colony.resources;
  if (!isObject(resources) || !resourceKeys.every((key) => isCount(resources[key]))) return null; // no missing/negative resource
  if (!Array.isArray(colony.dwarves) || !colony.dwarves.every(isDwarf)) return null;
  const dwarves = colony.dwarves as Dwarf[];
  if (new Set(dwarves.map((dwarf) => dwarf.id)).size !== dwarves.length) return null; // ids must be unique
  const job = colony.forgeJob ?? null;
  if (job !== null && !(isObject(job) && (job.recipe === "tool" || job.recipe === "weapon")
    && Number.isInteger(job.daysLeft) && (job.daysLeft as number) >= 1)) return null;
  // D7: a saved raid must be "none" or a countdown of 1..RAID_DELAY days
  const raid = colony.raid ?? null;
  if (raid !== null && !(isObject(raid) && Number.isInteger(raid.daysLeft)
    && (raid.daysLeft as number) >= 1 && (raid.daysLeft as number) <= RAID_DELAY)) return null;
  // D5: forge job and CRAFTING badge must match (the crafter exists and is the only crafting dwarf)
  const crafters = dwarves.filter((dwarf) => dwarf.status === "crafting").map((dwarf) => dwarf.id);
  if (crafters.join() !== (job ? [job.dwarfId] : []).join()) return null;
  if (!Array.isArray(activities) || !activities.every(isActivity)) return null;
  return { version: SAVE_VERSION, colony: colony as unknown as ColonyState, activities: (activities as Activity[]).slice(0, 6) };
}

// D5: refresh policy, applied once right after loading a save.
// Expedition: the request died with the page and the server keeps nothing -> dwarf comes home,
// no rewards, keeps their tool (same rule as a D4 failure; re-sending could pay twice).
// Forge: the job is saved with daysLeft and materials were already paid -> it simply continues.
export function restoreAfterRefresh(state: ColonyState) {
  let colony = state;
  const messages: { text: string; tone?: "good" | "warning" }[] = [];
  state.dwarves.filter((dwarf) => dwarf.status === "expedition").forEach((dwarf) => {
    colony = returnFromExpedition(colony, dwarf.id, {});
    messages.push({ text: `Contact with ${dwarf.name}'s expedition was lost when the hold was refreshed – ${dwarf.name} returned empty-handed.`, tone: "warning" });
  });
  const job = state.forgeJob;
  if (job) {
    const crafter = state.dwarves.find((dwarf) => dwarf.id === job.dwarfId);
    messages.push({ text: `${crafter?.name} resumes forging a ${job.recipe} (${job.daysLeft} day${job.daysLeft > 1 ? "s" : ""} left).` });
  }
  // D7: a coming raid is saved and keeps counting after a refresh (refreshing is no escape) -> remind the player
  if (state.raid) {
    messages.push({ text: `The goblins are still coming – attack in ${state.raid.daysLeft} day${state.raid.daysLeft > 1 ? "s" : ""}.`, tone: "warning" });
  }
  return { colony, messages };
}
