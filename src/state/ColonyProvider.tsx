import { useEffect, useRef, useState, type ReactNode } from "react";
import { beginExpedition } from "../api";
// D1: statusFor = shared badge rule, hungerMessages = chronicle text for hunger changes
// D2: craft/canCraft/recipes = forge rules, toggleTool = equip/return a tool
import { advanceDay, canCraft, craft, hungerMessages, jobLabel, recipes, statusFor, toggleTool, type RecipeId } from "../simulation";
import type {
  Activity,
  ColonyState,
  JobType,
  ResourceKey,
} from "../types";
import { ColonyContext, type ColonyContextValue } from "./ColonyContext";

const initialState: ColonyState = {
  day: 12,
  resources: {
    wood: 14,
    stone: 9,
    food: 18,
    tools: 1,
    weapons: 0, // D2: new colony resource, starts empty
  },
  dwarves: [
    {
      id: "dwarf-1",
      name: "Bromli Copperkeg",
      title: "Hold Warden",
      icon: "🧔🏻",
      assignment: "mining",
      status: "working",
      specialty: "mining",
    },
    {
      id: "dwarf-2",
      name: "Yrsa Flintbraid",
      title: "Trail Scout",
      icon: "🧔🏼‍♀️",
      assignment: "woodcutting",
      status: "working",
      specialty: "woodcutting",
    },
    {
      id: "dwarf-3",
      name: "Dori Ashmantle",
      title: "Stone Singer",
      icon: "🧔🏽",
      assignment: null,
      status: "idle",
    },
  ],
};

export function ColonyProvider({ children }: { children: ReactNode }) {
  const [colony, setColony] = useState(initialState);
  const [paused, setPaused] = useState(false);
  const [expeditionPending, setExpeditionPending] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([
    {
      id: "welcome",
      day: 12,
      message: "The forge fires are lit. Stonehome wakes.",
    },
  ]);

  useEffect(() => {
    if (paused) return;

    const timer = window.setInterval(
      () => setColony((current) => advanceDay(current)),
      8_000,
    );

    return () => window.clearInterval(timer);
  }, [paused]);

  // D1 chronicle: remembers the dwarves from the previous render, so we can see what changed.
  // WHY a ref: a ref keeps a value between renders, and changing it does not cause a new render.
  const previousDwarves = useRef(colony.dwarves);

  // D1 chronicle: runs after every change to the dwarves and logs hunger level changes.
  // WHY here and not inside setColony: React may call the setColony function twice in
  // development (Strict Mode), which would write every chronicle entry twice.
  useEffect(() => {
    const messages = hungerMessages(previousDwarves.current, colony.dwarves);
    previousDwarves.current = colony.dwarves;
    if (messages.length === 0) return;

    setActivities((current) =>
      [
        ...messages.map((message) => ({
          id: crypto.randomUUID(),
          day: colony.day,
          message: message.text,
          tone: message.tone,
        })),
        ...current,
      ].slice(0, 6), // same 6-entry limit as the other chronicle entries
    );
  }, [colony.dwarves, colony.day]);

  function assignDwarf(id: string, assignment: JobType) {
    setColony((current) => ({
      ...current,
      dwarves: current.dwarves.map((dwarf) =>
        dwarf.id === id
          ? {
              ...dwarf,
              assignment,
              // D1 badge fix: a dwarf hungry for 3+ days stays IDLE even with a job (shared rule)
              status: statusFor({ ...dwarf, assignment }),
            }
          : dwarf,
      ),
    }));

    const dwarf = colony.dwarves.find((item) => item.id === id);
    setActivities((current) =>
      [
        {
          id: crypto.randomUUID(),
          day: colony.day,
          message: `${dwarf?.name ?? "A dwarf"} assigned to ${jobLabel(assignment)}.`,
        },
        ...current,
      ].slice(0, 6),
    );
  }

  // D2: adds one chronicle entry (same 6-entry limit as the rest of the chronicle)
  function log(message: string, tone?: "good" | "warning") {
    setActivities((current) =>
      [{ id: crypto.randomUUID(), day: colony.day, message, tone }, ...current].slice(0, 6),
    );
  }

  // D2: one forge function for both recipes (replaces the old craftTool).
  // WHY: the old version only checked wood, so stone could go negative. canCraft checks EVERY material,
  // and craft() changes nothing if the check fails.
  function forge(recipe: RecipeId) {
    if (!canCraft(colony.resources, recipe)) {
      const { wood, stone } = recipes[recipe].cost;
      log(`The forge needs ${wood} wood and ${stone} stone for a ${recipe}.`, "warning");
      return;
    }
    setColony((current) => craft(current, recipe));
    log(recipe === "tool" ? "A sturdy iron tool joins the stores." : "A keen axe-blade joins the armory.", "good");
  }

  // D2: equip a free tool, or return it to storage. toggleTool re-checks against the newest state,
  // so a double click can never create or lose a tool.
  function equipOrReturnTool(id: string) {
    const dwarf = colony.dwarves.find((item) => item.id === id);
    if (!dwarf || dwarf.status === "expedition") return;
    if (!dwarf.hasTool && colony.resources.tools < 1) {
      log("No free tool in the stores.", "warning");
      return;
    }
    setColony((current) => toggleTool(current, id));
    log(dwarf.hasTool ? `${dwarf.name} returned a tool to the stores.` : `${dwarf.name} takes up a tool.`);
  }

  async function sendExpedition(dwarfId: string, destination: string) {
    const dwarf = colony.dwarves.find((item) => item.id === dwarfId);
    if (!dwarf) return;

    setExpeditionPending(true);
    setColony((current) => ({
      ...current,
      dwarves: current.dwarves.map((item) =>
        item.id === dwarf.id ? { ...item, status: "expedition" } : item,
      ),
    }));
    setActivities((current) => [
      {
        id: crypto.randomUUID(),
        day: colony.day,
        message: `${dwarf.name} departed for ${destination.replace("-", " ")}.`,
      },
      ...current,
    ]);

    try {
      const result = await beginExpedition(dwarf.id, destination);

      setColony((current) => ({
        ...current,
        resources: Object.entries(result.rewards).reduce(
          (all, [key, amount]) => ({
            ...all,
            [key]: all[key as ResourceKey] + (amount ?? 0),
          }),
          current.resources,
        ),
        dwarves: current.dwarves.map((item) =>
          item.id === dwarf.id
            ? {
                ...item,
                // D1 badge fix: same shared rule when the dwarf comes back from an expedition
                status: statusFor(item),
              }
            : item,
        ),
      }));
      setActivities((current) =>
        [
          {
            id: result.expeditionId,
            day: colony.day,
            message: result.message,
            tone: "good" as const,
          },
          ...current,
        ].slice(0, 6),
      );
    } catch (error) {
      setActivities((current) =>
        [
          {
            id: crypto.randomUUID(),
            day: colony.day,
            message:
              error instanceof Error
                ? error.message
                : "The expedition was lost from view.",
            tone: "warning" as const,
          },
          ...current,
        ].slice(0, 6),
      );
    }

    setExpeditionPending(false);
  }

  const value: ColonyContextValue = {
    colony,
    paused,
    activities,
    expeditionPending,
    togglePaused: () => setPaused((value) => !value),
    assignDwarf,
    craftTool: () => forge("tool"), // D2: both recipes go through the same checked forge
    craftWeapon: () => forge("weapon"),
    toggleTool: equipOrReturnTool,
    sendExpedition,
  };

  return <ColonyContext value={value}>{children}</ColonyContext>;
}
