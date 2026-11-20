import { NavLink, Outlet } from "react-router";
import { ResourceBar } from "../components/ResourceBar";
import { WEAPONS_NEEDED } from "../simulation"; // D7: weapon threshold for the raid banner
import { useColony } from "../state/ColonyContext";

export function Layout() {
  const { colony, paused, togglePaused, raidReport, closeRaidReport } = useColony(); // D7: popup state + OK action

  return (
    <main>
      <header className="masthead">
        <div className="brand">
          <b>⛏</b>
          <div>
            <small>THE DEEP REALMS OF</small>
            <h1>
              Dwarf<span>hold</span>
            </h1>
          </div>
        </div>

        <div className="hold-title">
          <small>COLONY</small>
          <strong>STONEHOME</strong>
          <span>Founded beneath Emberpeak</span>
        </div>

        <div className="day">
          <small>DEEP DAY</small>
          <strong>{colony.day}</strong>
          <button onClick={togglePaused}>
            {paused ? "Wake the hold" : "Pause"}
          </button>
        </div>
      </header>

      <nav className="main-nav" aria-label="Colony navigation">
        <NavLink to="/" end>
          Colony
        </NavLink>
        <NavLink to="/forge">Forge</NavLink>
      </nav>

      <ResourceBar resources={colony.resources} />
      {/* D7: raid banner on EVERY page (Layout wraps all pages), so the countdown is also visible
          on the Forge page, where the player prepares weapons */}
      {colony.raid && (
        <div className="raid-banner">
          ⚠ Goblins attack in {colony.raid.daysLeft} day{colony.raid.daysLeft > 1 ? "s" : ""} · armory{" "}
          {colony.resources.weapons} / {WEAPONS_NEEDED} weapons
          {colony.resources.weapons >= WEAPONS_NEEDED ? " – ready to defend!" : " – forge more or lose half the stores!"}
        </div>
      )}
      <Outlet />

      <footer>
        <span>🔥 Forge: burning</span>
        <span>Next deep day in ~8 seconds</span>
        <span>{paused ? "The hold is resting" : "⚙ Simulation active"}</span>
      </footer>

      {/* D7: attack result popup. The game is paused while it is open; OK closes it and resumes. */}
      {raidReport && (
        <div className="raid-overlay">
          <div className={`raid-popup ${raidReport.tone}`} role="alertdialog" aria-label="Goblin raid">
            <h2>⚔ The goblins attacked!</h2>
            <p>{raidReport.text}</p>
            <button onClick={closeRaidReport}>OK</button>
          </div>
        </div>
      )}
    </main>
  );
}
