import { hungerOutput, jobLabel } from "../simulation";
import type { Dwarf, JobType } from "../types";

const jobs: Exclude<JobType, null>[] = [
  "woodcutting",
  "mining",
  "farming",
];

// Turns days without a meal into card text, e.g. 2 days -> "Starving (2 days) · 30% output"
function hungerText(days: number) {
  if (days <= 0) return null;
  const percent = Math.round(hungerOutput[Math.min(days, 3)] * 100);
  if (days === 1) return `Hungry (1 day) · ${percent}% output`;
  if (days === 2) return `Starving (2 days) · ${percent}% output`;
  return `Collapsed (${days} days) · stopped working`;
}

interface Props {
  dwarves: Dwarf[];
  onAssign: (id: string, job: JobType) => void;
  onToggleTool: (id: string) => void; // D2: equip a free tool or return it
  freeTools: number; // D2: needed to disable "Equip tool" when the stock is empty
}

export function DwarfRoster({ dwarves, onAssign, onToggleTool, freeTools }: Props) {
  const presentDwarves = dwarves.filter(
    (dwarf) => dwarf.status !== "expedition",
  ).length;

  return (
    <section className="panel roster">
      <header>
        <div>
          <small>THE COMPANY</small>
          <h2>Holdfolk</h2>
        </div>
        <span>
          {presentDwarves} / {dwarves.length} present
        </span>
      </header>

      <div className="dwarf-list">
        {dwarves.map((dwarf) => {
          const isAway = dwarf.status === "expedition";
          // D3: job and tool are locked while away OR while crafting at the forge
          const isLocked = isAway || dwarf.status === "crafting";
          // D6: the ogre gets its own label (its title already says "Mountain Ogre")
          const specialty = dwarf.species === "ogre"
            ? "Heavy labourer"
            : dwarf.specialty
              ? `Skilled in ${jobLabel(dwarf.specialty)}`
              : "Generalist";
          const hunger = hungerText(dwarf.hungerDays ?? 0);

          return (
            <article
              className={isAway ? "dwarf away" : "dwarf"}
              key={dwarf.id}
            >
              <div className="portrait">
                {dwarf.icon}
                {/* The dot turns red when the dwarf missed a meal; the inline style overrides the status color only in that case */}
                <i
                  className={dwarf.status}
                  style={hunger ? { backgroundColor: "#d9534f" } : undefined}
                />
              </div>

              <div className="dwarf-details">
                {/* D2: tool mark next to the name, so the owner of each tool is visible at a glance */}
                <h3>
                  {dwarf.name}
                  {dwarf.hasTool && <span title="Carries a tool: +1 output per day"> ⚒️</span>}
                </h3>
                <p>
                  {dwarf.title} · {specialty}
                  {/* Hunger text is added to the existing line, so the card gets no extra row */}
                  {hunger && (
                    <span style={{ color: "#d9534f", fontSize: "1.2em", fontWeight: 600 }}> · {hunger}</span>
                  )}
                </p>

                <select
                  value={dwarf.assignment ?? ""}
                  disabled={isLocked} // D3: was isAway, now also locked while crafting
                  onChange={(event) =>
                    onAssign(
                      dwarf.id,
                      (event.target.value || null) as JobType,
                    )
                  }
                >
                  <option value="">Unassigned</option>
                  {jobs.map((job) => (
                    <option value={job} key={job}>
                      {jobLabel(job)}
                    </option>
                  ))}
                </select>

                {/* D2: one button that equips or returns. Disabled while away (D4 decides tools on
                    expeditions) or when there is no free tool to equip. */}
                <button
                  className="tool-button"
                  disabled={isLocked || (!dwarf.hasTool && freeTools < 1)} // D3: also locked while crafting
                  onClick={() => onToggleTool(dwarf.id)}
                >
                  {dwarf.hasTool ? "Return tool" : "Equip tool (+1/day)"}
                </button>
              </div>

              <span className="status">{dwarf.status}</span>
            </article>
          );
        })}
      </div>
    </section>
  );
}