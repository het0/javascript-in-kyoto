import { connectSocket } from "./socket.js";
import { drawBullets, drawEffects, drawMap, drawTanks } from "./render.js";
import type { Effect } from "./effects.js";
import type { MapDto, StateSnapshot } from "@jik/shared";

export type AppState = {
  map: MapDto | null;
  latest: StateSnapshot | null;
  effects: Effect[];
};

const state: AppState = {
  map: null,
  latest: null,
  effects: [],
};

connectSocket(state);

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

let lastFrameTime = performance.now();

const frame = (now: number): void => {
  const dt = now - lastFrameTime;
  lastFrameTime = now;

  state.effects = state.effects.filter((e) => e.advance(dt));

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (state.map) drawMap(ctx, state.map);
  if (state.latest) {
    drawTanks(ctx, state.latest.tanks);
    drawBullets(ctx, state.latest.bullets);
  }
  drawEffects(ctx, state.effects);

  requestAnimationFrame(frame);
};

requestAnimationFrame(frame);
