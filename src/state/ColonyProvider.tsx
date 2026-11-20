import { useEffect, useRef, useState, type ReactNode } from "react";
import { beginExpedition } from "../api";
// D1: statusFor = shared badge rule, hungerMessages = chronicle text for hunger changes
// D2: toggleTool = equip/return a tool
// D3: craftProblem/startCraft = timed forge rules, forgeMessages = chronicle text for a finished craft
// D4: expeditionProblem/departExpedition/returnFromExpedition = resilient expedition rules
// D5: parseSave/restoreAfterRefresh/SAVE_VERSION = save checks and refresh policy
import { advanceDay, craftProblem, departExpedition, expeditionProblem, forgeMessages, parseSave, restoreAfterRefresh, returnFromExpedition, hungerMessages, jobLabel, recipes, SAVE_VERSION, startCraft, statusFor, toggleTool, type RecipeId, type SaveData } from "../simulation";
import type {
  Activity,
  ColonyState,
  JobType,
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

// D5: the chronicle of a brand-new colony (moved out of useState so the load function can reuse it)
const initialActivities: Activity[] = [
  {
    id: "welcome",
    day: 12,
    message: "The forge fires are lit. Stonehome wakes.",
  },
];

// D5: localStorage key of the save. localStorage survives refresh AND closing the browser.
const SAVE_KEY = "dwarfhold-save";

// D5: builds the starting state: the saved game if it is valid, otherwise a new colony.
// Corrupt/incompatible save -> new colony + a visible warning in the chronicle.
function loadGame(): { colony: ColonyState; activities: Activity[] } {
  let text: string | null = null;
  try {
    text = localStorage.getItem(SAVE_KEY); // D5: can throw if storage is blocked (private mode)
  } catch {
    text = null;
  }
  const save = parseSave(text);
  if (!save) {
    if (text === null) return { colony: initialState, activities: initialActivities }; // no save yet
    return {
      colony: initialState,
      activities: [
        { id: crypto.randomUUID(), day: initialState.day, message: "The old records were unreadable – a new colony begins.", tone: "warning" },
        ...initialActivities,
      ],
    };
  }
  // D5: refresh policy (expedition dwarves come home, forge job continues) + chronicle messages
  const { colony, messages } = restoreAfterRefresh(save.colony);
  return {
    colony,
    activities: [
      ...messages.map((message) => ({ id: crypto.randomUUID(), day: colony.day, message: message.text, tone: message.tone })),
      ...save.activities,
    ].slice(0, 6),
  };
}

export function ColonyProvider({ children }: { children: ReactNode }) {
  // D5: lazy initializer = React calls loadGame only on the first render, not on every render.
  // WHY: reading and checking the save on every render would be wasted work.
  const [start] = useState(loadGame);
  const [colony, setColony] = useState(start.colony); // D5: was initialState
  const [paused, setPaused] = useState(false);
  const [expeditionPending, setExpeditionPending] = useState(false);
  const [activities, setActivities] = useState<Activity[]>(start.activities); // D5: was the fixed welcome entry

  // D5: autosave after every change of the colony or chronicle.
  // NOT saved: paused, expeditionPending and the click lock (temporary screen flags, not game state;
  // a saved lock would keep the button blocked after reload).
  useEffect(() => {
    try {
      const save: SaveData = { version: SAVE_VERSION, colony, activities };
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch {
      // D5: storage full or blocked -> the game keeps running, it just isn't saved
    }
  }, [colony, activities]);

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

  // D4: lock that is set AT THE CLICK. WHY a ref: the button only greys out after React redraws,
  // so two fast clicks could both start a request (= double rewards). A ref changes immediately.
  const expeditionLock = useRef(false);

  // D4: rewritten for resilience. Every path (success, error answer, timeout, server off)
  // ends with the dwarf back home, and rewards are added exactly once.
  async function sendExpedition(dwarfId: string, destination: string) {
    if (expeditionLock.current) return; // D4: a request is already running
    // D4: eligibility check (also covers the D3 "busy at the forge" case)
    const problem = expeditionProblem(colony, dwarfId);
    if (problem) {
      log(problem, "warning");
      return;
    }
    const dwarf = colony.dwarves.find((item) => item.id === dwarfId)!;

    expeditionLock.current = true;
    setExpeditionPending(true);
    setColony((current) => departExpedition(current, dwarfId)); // D4: tool stays equipped and travels along
    log(`${dwarf.name} departed for ${destination.replace("-", " ")}${dwarf.hasTool ? ", taking their tool" : ""}.`);

    try {
      const result = await beginExpedition(dwarf.id, destination);
      setColony((current) => returnFromExpedition(current, dwarfId, result.rewards)); // D4: rewards once
      // D4: random id instead of the server's expeditionId: the server restarts its numbering,
      // so the same id could appear twice in the chronicle list
      // D4: rewards listed in the message, e.g. "(+8 stone, +1 tool)", so the player sees where
      // new resources come from (a found tool is NEW, the dwarf's own tool just travelled along)
      const gains = Object.entries(result.rewards)
        .map(([key, amount]) => `+${amount} ${amount === 1 ? key.replace(/s$/, "") : key}`)
        .join(", ");
      log(`${result.message}${gains ? ` (${gains})` : ""}`, "good");
    } catch (error) {
      // D4 fix (Blocked Pass bug): a failed request now brings the dwarf back, with no rewards
      setColony((current) => returnFromExpedition(current, dwarfId, {}));
      log(
        `${error instanceof Error ? error.message : "The expedition was lost from view."} ${dwarf.name} returns empty-handed.`,
        "warning",
      );
    } finally {
      // D4: always unlock, whatever happened, so the button never stays blocked
      expeditionLock.current = false;
      setExpeditionPending(false);
    }
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
