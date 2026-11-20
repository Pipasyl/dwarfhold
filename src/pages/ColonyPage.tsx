import { useState } from "react";
import { Chronicle } from "../components/Chronicle";
import { DwarfRoster } from "../components/DwarfRoster";
// D2: workerOutput replaces the local hunger helper, so the ledger uses the exact simulation formula (tool + hunger)
import { jobLabel, production, workerOutput } from "../simulation";
import { useColony } from "../state/ColonyContext";
import type { ResourceKey } from "../types";

export function ColonyPage() {
  const {
    colony,
    activities,
    expeditionPending,
    assignDwarf,
    sendExpedition,
    toggleTool, // D2: equip/return button on the dwarf cards
  } = useColony();
  const [destination, setDestination] = useState("crystal-cave");
  const [expeditionDwarf, setExpeditionDwarf] = useState("dwarf-3");

  const dailyOutput = colony.dwarves.reduce<Record<ResourceKey, number>>(
    (total, dwarf) => {
      // D1 ledger fix: a dwarf on an expedition produces nothing (same rule as advanceDay),
      // so only present workers count here. Meals below still count everyone, because away dwarves eat too.
      // D3: a CRAFTING dwarf is at the forge and produces nothing either (same rule as advanceDay)
      if (dwarf.assignment && dwarf.status !== "expedition" && dwarf.status !== "crafting") {
        const output = production[dwarf.assignment];
        Object.entries(output).forEach(([resource, amount]) => {
          // Hungry dwarves count with their reduced output, so the net food matches the real day
          // D2: same shared formula as the simulation, so the tool bonus is included too
          total[resource as ResourceKey] += workerOutput(dwarf, amount ?? 0);
        });
      }
      return total;
    },
    {
      wood: 0,
      stone: 0,
      food: -colony.dwarves.length,
      tools: 0,
      weapons: 0, // D2: new resource, never produced by daily work
    },
  );

  return (
    <div className="dashboard">
      {/* D2: the roster also gets the equip/return action and the free tool count */}
      <DwarfRoster
        dwarves={colony.dwarves}
        onAssign={assignDwarf}
        onToggleTool={toggleTool}
        freeTools={colony.resources.tools}
      />

      <section className="center-stack">
        <section className="panel production">
          <header>
            <div>
              <small>SHIFT LEDGER</small>
              <h2>Daily Production</h2>
            </div>
            <span>updates each day</span>
          </header>

          <div className="job-grid">
            {(["woodcutting", "mining", "farming"] as const).map((job) => {
              const workers = colony.dwarves.filter(
                (dwarf) => dwarf.assignment === job,
              );
              // D1 ledger fix: only workers who are present produce; "N assigned" still shows everyone with the job
              // D3: crafting dwarves are left out too, because they are at the forge
              const present = workers.filter((dwarf) => dwarf.status !== "expedition" && dwarf.status !== "crafting");
              const perDwarf = Object.values(production[job])[0] ?? 0;
              // D1 ledger fix: present workers only, so "−N from hunger" shows only hunger losses
              // D2: "full" = output without hunger, including +1 for each worker with a tool
              const full = present.reduce((sum, dwarf) => sum + perDwarf + (dwarf.hasTool ? 1 : 0), 0);
              // Real output of this job today, with hunger and tools applied (D2: shared formula)
              const actual = present.reduce(
                (sum, dwarf) => sum + workerOutput(dwarf, perDwarf),
                0,
              );

              return (
                <article key={job}>
                  <b>
                    {job === "woodcutting"
                      ? "🌲"
                      : job === "mining"
                        ? "⛏️"
                        : "🍄"}
                  </b>
                  <h3>{jobLabel(job)}</h3>
                  <p>{workers.length} assigned</p>
                  <strong>+{actual} / day</strong>
                  {/* Only shown when hunger removes output, so the reason is visible */}
                  {actual < full && (
                    <small style={{ color: "#d9534f", display: "block" }}>
                      −{full - actual} from hunger
                    </small>
                  )}
                </article>
              );
            })}
          </div>

          <div className="net-line">
            <span>NET FOOD AFTER MEALS</span>
            <strong className={dailyOutput.food >= 0 ? "gain" : "loss"}>
              {dailyOutput.food >= 0 ? "+" : ""}
              {dailyOutput.food}
            </strong>
          </div>
        </section>
      </section>

      <aside className="side-stack">
        <section className="panel expedition">
          <header>
            <div>
              <small>BEYOND THE GATE</small>
              <h2>Expedition</h2>
            </div>
            <b>🗺️</b>
          </header>

          <label>
            Scout
            <select
              value={expeditionDwarf}
              onChange={(event) => setExpeditionDwarf(event.target.value)}
            >
              {colony.dwarves.map((dwarf) => (
                <option key={dwarf.id} value={dwarf.id}>
                  {dwarf.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Destination
            <select
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
            >
              <option value="crystal-cave">Crystal Cave</option>
              <option value="old-mine">The Old Mine</option>
              <option value="blocked-pass">Blocked Pass</option>
            </select>
          </label>

          <button
            disabled={expeditionPending}
            onClick={() => sendExpedition(expeditionDwarf, destination)}
          >
            {expeditionPending ? "Beyond the gate…" : "Send expedition"}
          </button>
          <p>
            A result returns in one request. The selected dwarf is unavailable
            while travelling.
          </p>
          {/* D4: the team's tool rule and failure rule, shown where the player decides */}
          <p>
            An equipped tool travels with the dwarf (no bonus while away). A failed
            trip brings the dwarf back empty-handed.
          </p>
        </section>

        <Chronicle activities={activities} />
      </aside>
    </div>
  );
}