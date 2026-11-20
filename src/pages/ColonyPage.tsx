import { useState } from "react";
import { Chronicle } from "../components/Chronicle";
import { DwarfRoster } from "../components/DwarfRoster";
import { hungerOutput, jobLabel, production } from "../simulation";
import { useColony } from "../state/ColonyContext";
import type { Dwarf, ResourceKey } from "../types";

// Same rule as the simulation: hungerDays -> share of normal output (rounded per dwarf)
const hungerShare = (dwarf: Dwarf) =>
  hungerOutput[Math.min(dwarf.hungerDays ?? 0, 3)];

export function ColonyPage() {
  const {
    colony,
    activities,
    expeditionPending,
    assignDwarf,
    sendExpedition,
  } = useColony();
  const [destination, setDestination] = useState("crystal-cave");
  const [expeditionDwarf, setExpeditionDwarf] = useState("dwarf-3");

  const dailyOutput = colony.dwarves.reduce<Record<ResourceKey, number>>(
    (total, dwarf) => {
      if (dwarf.assignment) {
        const output = production[dwarf.assignment];
        Object.entries(output).forEach(([resource, amount]) => {
          // Hungry dwarves count with their reduced output, so the net food matches the real day
          total[resource as ResourceKey] += Math.round(
            (amount ?? 0) * hungerShare(dwarf),
          );
        });
      }
      return total;
    },
    {
      wood: 0,
      stone: 0,
      food: -colony.dwarves.length,
      tools: 0,
    },
  );

  return (
    <div className="dashboard">
      <DwarfRoster dwarves={colony.dwarves} onAssign={assignDwarf} />

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
              const perDwarf = Object.values(production[job])[0] ?? 0;
              const full = workers.length * perDwarf;
              // Real output of this job today, with hunger applied
              const actual = workers.reduce(
                (sum, dwarf) => sum + Math.round(perDwarf * hungerShare(dwarf)),
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
        </section>

        <Chronicle activities={activities} />
      </aside>
    </div>
  );
}