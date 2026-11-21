// Split: this file used to hold ALL game rules (~430 lines). They now live in src/rules/, one file per topic.
// WHY this file still exists: it re-exports everything (a "barrel" file), so every other file keeps
// importing from "./simulation" and nothing else had to change.
export * from "./rules/production"; // production tables, tool bonus (workerOutput), job names
export * from "./rules/hunger"; // D1 hunger stages, WORKING/IDLE badge, hunger messages, game over
export * from "./rules/day"; // advanceDay (one day) + the D7 raid chronicle
export * from "./rules/forge"; // D2 recipes + tools, D3 timed crafting, D6 ogre forge rules
export * from "./rules/expeditions"; // D4 depart / return exactly once
export * from "./rules/save"; // D5 save checks + refresh policy
export * from "./rules/ogre"; // D6 the ogre joins
export * from "./rules/raids"; // D7 raid trigger, numbers, the attack
