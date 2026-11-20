import { useEffect, useRef, useState, type ReactNode } from "react";
import { beginExpedition } from "../api";
// D1: statusFor = shared badge rule, hungerMessages = chronicle text for hunger changes
// D2: toggleTool = equip/return a tool
// D3: craftProblem/startCraft = timed forge rules, forgeMessages = chronicle text for a finished craft
import { advanceDay, craftProblem, forgeMessages, hungerMessages, jobLabel, recipes, startCraft, statusFor, toggleTool, type RecipeId } from "../simulation";
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
  forgeJob: null, // D3: the forge starts free
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

  // D1 chronicle: remembers the colony from the previous render, so we can see what changed.
  // WHY a ref: a ref keeps a value between renders, and changing it does not cause a new render.
  // D3: now stores the whole colony (not only the dwarves), because the forge job is needed too.
  const previousColony = useRef(colony);

  // D1 chronicle: runs after every change and logs hunger level changes.
  // WHY here and not inside setColony: React may call the setColony function twice in
  // development (Strict Mode), which would write every chronicle entry twice.
  useEffect(() => {
    const before = previousColony.current;
    const messages = [
      ...hungerMessages(before.dwarves, colony.dwarves),
      ...forgeMessages(before, colony), // D3: "X finished forging a tool" when a craft completes
    ];
    previousColony.current = colony;
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
  }, [colony]); // D3: whole colony, so a finished forge job is noticed too

  function assignDwarf(id: string, assignment: JobType) {
    // D3: a CRAFTING dwarf keeps their job until the craft is done (dropdown is locked too)
    if (colony.dwarves.find((item) => item.id === id)?.status === "crafting") return;
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

  // D2: one forge function for both recipes. D3: it now STARTS a timed craft with a chosen dwarf.
  // Invalid attempt (no dwarf, not eligible, forge busy, missing materials) -> only a warning,
  // nothing else changes. startCraft checks again on the newest state, so a double click can't start two crafts.
  function forge(recipe: RecipeId, dwarfId: string) {
    const problem = craftProblem(colony, recipe, dwarfId);
    if (problem) {
      log(problem, "warning");
      return;
    }
    const dwarf = colony.dwarves.find((item) => item.id === dwarfId);
    setColony((current) => startCraft(current, recipe, dwarfId));
    log(`${dwarf?.name} starts forging a ${recipe} – ready on day ${colony.day + recipes[recipe].days}.`);
  }

  // D2: equip a free tool, or return it to storage. toggleTool re-checks against the newest state,
  // so a double click can never create or lose a tool.
  function equipOrReturnTool(id: string) {
    const dwarf = colony.dwarves.find((item) => item.id === id);
    // D3: also no tool changes while CRAFTING (button is locked too)
    if (!dwarf || dwarf.status === "expedition" || dwarf.status === "crafting") return;
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
    // D3: a dwarf at the forge can't leave at the same time (one activity per dwarf)
    if (dwarf.status === "crafting") {
      log(`${dwarf.name} is busy at the forge.`, "warning");
      return;
    }

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
    startForge: forge, // D3: one action for both recipes, with the chosen dwarf (replaces craftTool/craftWeapon)
    toggleTool: equipOrReturnTool,
    sendExpedition,
  };

  return <ColonyContext value={value}>{children}</ColonyContext>;
}
