import { createContext, useContext } from "react";
import type { RecipeId } from "../simulation"; // D3: recipe id for startForge
import type { Activity, ColonyState, JobType } from "../types";

export interface ColonyContextValue {
  colony: ColonyState;
  paused: boolean;
  activities: Activity[];
  expeditionPending: boolean;
  togglePaused: () => void;
  assignDwarf: (id: string, assignment: JobType) => void;
  startForge: (recipe: RecipeId, dwarfId: string) => void; // D3: start a timed craft with a dwarf (replaces craftTool/craftWeapon)
  toggleTool: (dwarfId: string) => void; // D2: equip a free tool or return it
  sendExpedition: (dwarfId: string, destination: string) => Promise<void>;
  // D7: result of the attack shown as a popup (null = no popup) + the OK button that closes it
  raidReport: { text: string; tone: "good" | "warning" } | null;
  closeRaidReport: () => void;
}

export const ColonyContext = createContext<ColonyContextValue | null>(null);

export function useColony(): ColonyContextValue {
  const context = useContext(ColonyContext);
  if (!context) {
    throw new Error("useColony must be used inside <ColonyProvider>");
  }
  return context;
}
