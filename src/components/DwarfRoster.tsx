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
}

export function DwarfRoster({ dwarves, onAssign }: Props) {
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
          const specialty = dwarf.specialty
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
                <h3>{dwarf.name}</h3>
                <p>
                  {dwarf.title} · {specialty}
                  {/* Hunger text is added to the existing line, so the card gets no extra row */}
                  {hunger && (
                    <span style={{ color: "#d9534f", fontSize: "1.2em", fontWeight: 600 }}> · {hunger}</span>
                  )}
                </p>

                <select
                  value={dwarf.assignment ?? ""}
                  disabled={isAway}
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
              </div>

              <span className="status">{dwarf.status}</span>
            </article>
          );
        })}
      </div>
    </section>
  );
}