import { io } from "socket.io-client";
import { makeExplosion, makeHitFlash, makeSpawnPulse } from "./effects.js";
import { updateScoreboard } from "./scoreboard.js";
import type { AppState } from "./main.js";

const SERVER_URL = import.meta.env["VITE_SERVER_URL"] ?? "http://localhost:3000";

export function connectSocket(state: AppState): void {
  const socket = io(`${SERVER_URL}/renderer`);

  const statusEl = document.getElementById("connection-status");
  const setStatus = (connected: boolean) => {
    if (!statusEl) return;
    statusEl.textContent = connected ? "● Connected" : "○ Disconnected";
    statusEl.className = `connection-status ${connected ? "connected" : "disconnected"}`;
  };

  setStatus(false);

  socket.on("connect", () => setStatus(true));
  socket.on("disconnect", () => setStatus(false));

  socket.on("MAP", (map) => {
    state.map = map;
  });

  socket.on("STATE", (snap) => {
    state.latest = snap;
    updateScoreboard(snap.scoreboard);
  });

  socket.on("PLAYER_HIT", (ev) => {
    state.effects.push(makeHitFlash(ev.position));
  });

  socket.on("PLAYER_KILLED", (ev) => {
    state.effects.push(makeExplosion(ev.position));
  });

  socket.on("PLAYER_RESPAWNED", (ev) => {
    state.effects.push(makeSpawnPulse(ev.position));
  });

  socket.on("PLAYER_JOINED", (p) => {
    console.log(`${p.name} joined`);
  });

  socket.on("PLAYER_LEFT", ({ playerId }) => {
    console.log(`${playerId} left`);
  });
}
