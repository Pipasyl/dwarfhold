import { useState } from "react"; // D3: remembers which dwarf is chosen for the forge
import { Chronicle } from "../components/Chronicle";
import { recipes } from "../simulation";
import { useColony } from "../state/ColonyContext";

export function ForgePage() {
  // D3: startForge replaces craftTool/craftWeapon; colony is needed for the dwarves and the forge job
  const { activities, colony, startForge } = useColony();
  // D3: the chosen smith (first dwarf by default, so the picker is never empty)
  const [smithId, setSmithId] = useState(colony.dwarves[0]?.id ?? "");

  // D3: who is crafting what, so the page can show it and lock the buttons
  const job = colony.forgeJob;
  const crafter = job && colony.dwarves.find((dwarf) => dwarf.id === job.dwarfId);
  // D3: the craft only advances on days the crafter can work (3+ hungry days = paused, D1 rule)
  const paused = crafter ? (crafter.hungerDays ?? 0) >= 3 : false;

  return (
    <div className="forge-layout">
      {/* D2: wrapper so the two recipes stack in the left column and the chronicle stays on the right */}
      <div className="center-stack">
        {/* D3: forge status: who is crafting and when it completes (required by D3) */}
        <section className="panel forge">
          <div>
            <small>EMBER FORGE · SMITH</small>
            {job && crafter ? (
              <>
                <h2>
                  {crafter.icon} {crafter.name} is forging a {job.recipe}
                </h2>
                <p>
                  {paused
                    ? "Paused – too hungry to work. Continues after a meal."
                    : `Ready on day ${colony.day + job.daysLeft} (${job.daysLeft} day${job.daysLeft > 1 ? "s" : ""} left).`}
                </p>
              </>
            ) : (
              <>
                <h2>The forge is free</h2>
                <p>Choose a smith. They leave their job while crafting and return to it afterwards.</p>
              </>
            )}
          </div>
          {/* D3: picker shows every dwarf with their status, so the player sees who is eligible */}
          <label className="smith-picker">
            Smith
            <select value={smithId} onChange={(event) => setSmithId(event.target.value)}>
              {colony.dwarves.map((dwarf) => (
                <option key={dwarf.id} value={dwarf.id}>
                  {dwarf.name} ({dwarf.status})
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="panel forge">
          <div>
            <small>EMBER FORGE</small>
            <h2>Craft a tool</h2>
            {/* D2: explains what a tool is for, so the player can decide between tool and weapon */}
            <p>Equip a dwarf on the Colony page: +1 of their resource per day.</p>
          </div>
          <div className="recipe">
            {/* D2: costs come from the shared recipe table, so the screen always matches the real cost */}
            <span>{recipes.tool.cost.wood} 🪵</span>
            <i>+</i>
            <span>{recipes.tool.cost.stone} 🪨</span>
            <i>→</i>
            <span>1 ⚒️</span>
            {/* D3: shows the crafting time; disabled while the forge is busy (one craft at a time) */}
            <span>· {recipes.tool.days} day</span>
            <button disabled={Boolean(job)} onClick={() => startForge("tool", smithId)}>
              Forge tool
            </button>
          </div>
        </section>

        {/* D2: new weapon recipe. Weapons are stored as a colony resource to defend Stonehome. */}
        <section className="panel forge">
          <div>
            <small>EMBER FORGE</small>
            <h2>Craft a weapon</h2>
            <p>Stored in the armory to defend Stonehome against hostile events.</p>
          </div>
          <div className="recipe">
            <span>{recipes.weapon.cost.wood} 🪵</span>
            <i>+</i>
            <span>{recipes.weapon.cost.stone} 🪨</span>
            <i>→</i>
            <span>1 🗡️</span>
            {/* D3: crafting time + same busy lock as the tool */}
            <span>· {recipes.weapon.days} days</span>
            <button disabled={Boolean(job)} onClick={() => startForge("weapon", smithId)}>
              Forge weapon
            </button>
          </div>
        </section>
      </div>

      <Chronicle activities={activities} />
    </div>
  );
}
