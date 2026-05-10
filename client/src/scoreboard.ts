import type { ScoreboardEntry } from "@jik/shared";

const el = document.getElementById("scoreboard")!;

export function updateScoreboard(entries: ScoreboardEntry[]): void {
  el.innerHTML =
    `<h2>Scoreboard</h2>` +
    entries
      .map(
        (e) => `
      <div class="scoreboard-row ${e.state === "dead" ? "dead" : ""}">
        <span class="name">${escapeHtml(e.name)}</span>
        <span class="kd">${e.kills}/${e.deaths}</span>
      </div>
    `,
      )
      .join("");
}

function escapeHtml(s: string): string {
  return s.replace(
    /[<>&"']/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
