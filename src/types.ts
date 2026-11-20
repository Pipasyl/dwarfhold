// D2: "weapons" added as a colony resource (weapons are stored, not owned by a dwarf)
export type ResourceKey = "wood" | "stone" | "food" | "tools" | "weapons";
export type JobType = "woodcutting" | "mining" | "farming" | null;
// D3: "crafting" = the dwarf is at the forge (no normal job meanwhile)
export type DwarfStatus = "idle" | "working" | "expedition" | "crafting";
// D2: tools = FREE tools in storage only; equipped tools live on the dwarf (hasTool)
export interface Resources { wood: number; stone: number; food: number; tools: number; weapons: number }

export interface Dwarf { 
    id: string;
     name: string; 
     title: string; 
     icon: string; 
     assignment: JobType; 
     status: DwarfStatus; 
     specialty?: Exclude<JobType, null> 
     // Counts consecutive days without a meal.
     hungerDays?: number
     // D2: true while this dwarf carries a tool (max 1 per dwarf, so yes/no is enough)
     hasTool?: boolean
}

export interface ColonyState { 
    day: number; 
    resources: Resources; 
    dwarves: Dwarf[] 
    // D3: the one running forge task (one forge = one craft at a time); null/missing = forge free
    forgeJob?: ForgeJob | null
}

// D3: who is crafting what, and how many days of work are left
export interface ForgeJob {
    dwarfId: string;
    recipe: "tool" | "weapon";
    daysLeft: number
}

export interface ExpeditionResult { 
    expeditionId: string; 
    status: "completed"; 
    rewards: Partial<Resources>; 
    message: string 
}

export interface Activity { 
    id: string; 
    day: number; 
    message: string; 
    tone?: "good" | "warning" 
}
