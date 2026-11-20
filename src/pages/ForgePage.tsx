import { Chronicle } from "../components/Chronicle";
import { recipes } from "../simulation";
import { useColony } from "../state/ColonyContext";

export function ForgePage() {
  // D2: craftWeapon added next to craftTool
  const { activities, craftTool, craftWeapon } = useColony();

  return (
    <div className="forge-layout">
      {/* D2: wrapper so the two recipes stack in the left column and the chronicle stays on the right */}
      <div className="center-stack">
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
            <button onClick={craftTool}>Forge tool</button>
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
            <button onClick={craftWeapon}>Forge weapon</button>
          </div>
        </section>
      </div>

      <Chronicle activities={activities} />
    </div>
  );
}
