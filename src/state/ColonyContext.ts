import { createContext, useContext } from "react";
import type { Activity, ColonyState, JobType } from "../types";

export interface ColonyContextValue {
  colony: ColonyState;
  paused: boolean;
  activities: Activity[];
  expeditionPending: boolean;
  togglePaused: () => void;
  assignDwarf: (id: string, assignment: JobType) => void;
  craftTool: () => void;
  craftWeapon: () => void; // D2: forge a weapon (2 wood + 4 stone)
  toggleTool: (dwarfId: string) => void; // D2: equip a free tool or return it
  sendExpedition: (dwarfId: string, destination: string) => Promise<void>;
}

export const ColonyContext = createContext<ColonyContextValue | null>(null);

export function useColony(): ColonyContextValue {
  const context = useContext(ColonyContext);
  if (!context) {
    throw new Error("useColony must be used inside <ColonyProvider>");
  }
  return context;
}
