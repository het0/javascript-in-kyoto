# javascript-in-kyoto — Renderer (Client) Implementation Plan

**Project:** `javascript-in-kyoto` — a Battle City deathmatch built at the JavaScript in Kyoto meetup
**Stack:** TypeScript · Vite · plain Canvas API · Socket.IO client
**Audience:** Junior engineers (meetup project)
**Scope:** This document covers the **`client/`** package only — the renderer. For the server, see [`backend-plan.md`](./backend-plan.md).

---

## 0. The One-Sentence Summary

The renderer connects to `ws://host/renderer`, receives `STATE` snapshots and `PLAYER_*` events, and draws everything on a single `<canvas>` element using `requestAnimationFrame`. **No game engine. No PixiJS. No React. Just Canvas.**

---

## 1. Guiding Principles

Read these first. They're the whole rationale for the design choices below.

1. **No extra libraries beyond what we absolutely need.** TypeScript, Vite for dev server + bundling, and `socket.io-client`. That's it. No PixiJS, no Three.js, no React, no Tailwind.
2. **The renderer is a TV screen.** It receives data. It draws data. It does not think. It does not predict. It does not interpolate the future. If the server says "tank is at (10, 5)", the tank is at (10, 5). End of story.
3. **The Canvas API is enough.** A 40×40 tile map at 16px per tile is 640×640 pixels. Drawing ~10 tanks, a few bullets, and a tile grid at 30 FPS is a trivial workload for the Canvas API. People built [WebKit](https://www.kirupa.com/canvas/index.htm)-era games on far less.
4. **One file is fine; many files are also fine.** Don't pre-emptively split into packages. Start in one or two files. Split when a file genuinely outgrows itself (300+ lines).
5. **No build wizardry.** Vite's defaults work. We don't need PostCSS plugins, custom asset pipelines, or anything fancy.

---

## 2. What the Renderer Has to Do

In order of importance:

1. **Connect to `ws://host/renderer`** and stay connected (Socket.IO handles reconnection automatically).
2. **Receive the initial `MAP`** and store it.
3. **Receive `STATE` every tick** (~30 Hz) and store the latest snapshot.
4. **Draw everything at ~60 FPS** via `requestAnimationFrame`, reading from the latest stored state.
5. **React to `PLAYER_*` events** by spawning short-lived visual effects (hit flashes, explosions, spawn-in pulses).
6. **Show the scoreboard** as a simple overlay or sidebar.

That's the whole feature list. Notice what's missing: no input handling, no menu system, no settings, no audio (v1).

---

## 3. Tech Choices

| Concern | Choice | Why |
|---------|--------|-----|
| Language | TypeScript 5.x | Same as server; share types via `shared/` |
| Build | Vite | Zero-config dev server + ESBuild bundling; HMR for free |
| Rendering | Canvas 2D API (`<canvas>`) | Built into the browser, plenty fast for our scale |
| WebSocket | `socket.io-client` 4.x | Matches the server; auto-reconnect |
| Styling | Plain CSS (`style.css`) | One file. No frameworks. |
| State | Plain TypeScript objects | No Redux, no Zustand, no signals library |

**Deliberately avoided:**

- **PixiJS / Three.js / Phaser** — game engines are overkill for 16px-tile 2D rendering. They'd add a learning curve unrelated to the meetup's clean-architecture teaching goal.
- **React / Vue / Svelte** — there's no DOM diffing problem to solve. The whole UI is one canvas element plus an overlay.
- **A state library** — the renderer's "state" is literally `{ map, latestState, effects[] }`. A plain object suffices.
- **Tailwind / CSS-in-JS** — we have like 20 lines of CSS. Plain CSS is fine.
- **An asset pipeline** — for v1, tanks and tiles are colored rectangles. No sprites.

---

## 4. Project Layout

```
client/
├── index.html              # The single page — has one <canvas> and one <div id="scoreboard">
├── src/
│   ├── main.ts             # Entry point: wires socket + render loop
│   ├── socket.ts           # Connect to /renderer namespace; expose latest state
│   ├── render.ts           # The draw functions (drawMap, drawTanks, drawBullets, drawEffects)
│   ├── effects.ts          # The transient visual effects (hit flash, explosion, spawn)
│   ├── scoreboard.ts       # Updates the DOM scoreboard from STATE
│   └── style.css           # Layout + the few colors we need
├── public/                 # (empty for v1 — no assets)
├── package.json
├── tsconfig.json
└── vite.config.ts          # Default Vite config, basically empty
```

That's around **6 source files**, none of them likely to exceed 200 lines. The `client/` package is intentionally tiny because the renderer is intentionally simple.

> **No clean-architecture layers in the client.** The server has `domain/`/`usecase/`/`adapter/` because it has real business logic to protect. The renderer has none — it's a thin function from `(state) → pixels`. Splitting it into layers would be cargo-culting. The teaching point of clean architecture lives in `server/`; let it shine there.

---

## 5. The Render Loop

The whole architecture in pseudocode:

```ts
// src/main.ts
const state = {
  map: null,
  latest: null,            // most recent STATE snapshot
  effects: [],             // active transient effects (hit flashes, explosions)
};

connectSocket(state);        // sets up listeners that mutate `state`
startRenderLoop(state);      // requestAnimationFrame loop reading from `state`

// src/main.ts (loop)
function startRenderLoop(state) {
  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  let lastFrameTime = performance.now();

  function frame(now: number) {
    const dt = now - lastFrameTime;
    lastFrameTime = now;

    // Advance any active effects (e.g. fade out an explosion)
    state.effects = state.effects.filter(e => e.advance(dt));

    // Clear and redraw everything from scratch every frame.
    // This is fine: 640x640 pixels at 60 FPS is nothing.
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (state.map)    drawMap(ctx, state.map);
    if (state.latest) drawTanks(ctx, state.latest.tanks);
    if (state.latest) drawBullets(ctx, state.latest.bullets);
    drawEffects(ctx, state.effects);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
```

### Why redraw everything every frame?

It's tempting to be clever and only redraw "dirty" tiles. **Don't.** A 640×640 canvas redraws in well under a millisecond on any device made in the last decade. Dirty-rect optimization triples your code complexity for zero perceptible win at this scale. **The simple version is fast enough.**

### Decoupled tick rates

- The **server** ticks at 30 Hz and broadcasts `STATE`.
- The **renderer** draws at whatever the browser gives us via `requestAnimationFrame` (typically 60 Hz, sometimes 120, sometimes 30 if the tab is backgrounded).

These don't need to match. The renderer just draws the most recent state it has. If `STATE` arrives twice between frames, the older one is overwritten. That's fine — the latest truth wins.

> **Should we interpolate between snapshots for smoother motion?** No, not in v1. Fixed positions look slightly steppy at 30 Hz on a 60 Hz display, but it's playable, it's honest, and it's easy. Adding interpolation is a great v2 task and a fantastic teaching topic — but if we put it in v1, juniors will spend all their debugging time on "the tank looks fine but the bullet is one tile behind where it kills me."

---

## 6. Connecting to the Server

```ts
// src/socket.ts
import { io } from "socket.io-client";

export function connectSocket(state: AppState) {
  const socket = io("http://localhost:3000/renderer");

  socket.on("MAP", (map) => {
    state.map = map;
  });

  socket.on("STATE", (snap) => {
    state.latest = snap;
    updateScoreboard(snap.scoreboard);   // touches the DOM
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

  // PLAYER_JOINED / PLAYER_LEFT can update the scoreboard immediately
  // (or just wait for the next STATE which carries the full scoreboard anyway)
  socket.on("PLAYER_JOINED", (p) => {
    console.log(`${p.name} joined`);
  });
  socket.on("PLAYER_LEFT", ({ playerId }) => {
    console.log(`${playerId} left`);
  });
}
```

The whole connection layer is one file, ~30 lines. There is nothing else to it — Socket.IO handles reconnection, message framing, and JSON parsing.

---

## 7. The Drawing Functions

Each `draw*` function takes the canvas context and the relevant slice of state. They're pure — no side effects beyond the canvas mutations.

### Tile constants

```ts
// src/render.ts
const TILE_PX = 16;
const COLORS = {
  empty:  "#222",     // dark gray
  brick:  "#a05a2c",  // brown
  steel:  "#999",     // light gray
  water:  "#3060c0",  // blue
};
```

### Draw the map

```ts
function drawMap(ctx: CanvasRenderingContext2D, map: MapDto) {
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = map.tiles[y][x];
      ctx.fillStyle = tileColor(tile);
      ctx.fillRect(x * TILE_PX, y * TILE_PX, TILE_PX, TILE_PX);
    }
  }
}
```

Each frame redraws all 1600 tiles. That's still nothing. (If you want to optimize anyway: cache the map onto an offscreen canvas once on `MAP`, blit it to the main canvas each frame. Two extra functions for a 5x speedup the user won't notice.)

### Draw tanks

```ts
function drawTanks(ctx: CanvasRenderingContext2D, tanks: TankDto[]) {
  for (const tank of tanks) {
    const px = tank.x * TILE_PX;
    const py = tank.y * TILE_PX;
    const size = 2 * TILE_PX;        // tanks are 2x2 tiles

    // Body color depends on hp
    ctx.fillStyle = tankColor(tank.hp);
    ctx.fillRect(px, py, size, size);

    // Direction indicator: a small rectangle on the firing edge
    drawTurret(ctx, px, py, size, tank.direction);

    // Name label above
    ctx.fillStyle = "white";
    ctx.font = "10px monospace";
    ctx.fillText(tank.name, px, py - 2);

    // HP indicator: three small bars above the name
    drawHpBar(ctx, px, py - 14, tank.hp);
  }
}
```

The renderer is free to express HP however it wants — three bars is one reasonable default. A color tint, hearts, a numeric label — all valid. The contract from the server is just `hp: 0..3`.

### Draw bullets

```ts
function drawBullets(ctx: CanvasRenderingContext2D, bullets: BulletDto[]) {
  ctx.fillStyle = "yellow";
  for (const b of bullets) {
    ctx.fillRect(b.x * TILE_PX, b.y * TILE_PX, 4, 4);
  }
}
```

A 4px yellow square. That's a bullet. We can do better in v2.

### Draw effects

```ts
function drawEffects(ctx: CanvasRenderingContext2D, effects: Effect[]) {
  for (const e of effects) e.draw(ctx);
}
```

Effects are objects with `advance(dt)` and `draw(ctx)` methods. See section 8.

---

## 8. Visual Effects (Hit / Kill / Spawn)

Effects are short-lived animations triggered by server events. They are **purely visual** — they don't affect game state, they don't talk to the server, they just exist for some milliseconds and then disappear.

### The Effect interface

```ts
// src/effects.ts
export type Effect = {
  /** Returns true if the effect should still be alive. */
  advance(dt: number): boolean;
  draw(ctx: CanvasRenderingContext2D): void;
};
```

The render loop calls `advance(dt)` to age the effect, removing it when `advance` returns false.

### Hit flash

A brief white square overlay at the hit position.

```ts
export function makeHitFlash(pos: Position): Effect {
  let life = 150;  // ms
  return {
    advance(dt) {
      life -= dt;
      return life > 0;
    },
    draw(ctx) {
      const alpha = Math.max(0, life / 150);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fillRect(pos.x * TILE_PX, pos.y * TILE_PX, 2 * TILE_PX, 2 * TILE_PX);
    },
  };
}
```

That's it. 12 lines for a hit flash effect. No animation library, no particle system.

### Explosion

A simple expanding ring, fading out.

```ts
export function makeExplosion(pos: Position): Effect {
  let life = 600;  // ms
  return {
    advance(dt) {
      life -= dt;
      return life > 0;
    },
    draw(ctx) {
      const t = 1 - life / 600;             // 0 → 1
      const radius = TILE_PX * (1 + 2 * t); // grows from 1 to 3 tiles
      const alpha = 1 - t;
      ctx.strokeStyle = `rgba(255, 100, 0, ${alpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(
        (pos.x + 1) * TILE_PX,   // center the ring on the 2x2 tank
        (pos.y + 1) * TILE_PX,
        radius,
        0, Math.PI * 2,
      );
      ctx.stroke();
    },
  };
}
```

Want a fancier explosion? Add particles. Want particles? Spawn N small `Effect` objects, each a fading dot moving outward. The pattern composes.

### Spawn pulse

A pulsing ring at the new tank's position.

```ts
export function makeSpawnPulse(pos: Position): Effect {
  let life = 800;
  return {
    advance(dt) {
      life -= dt;
      return life > 0;
    },
    draw(ctx) {
      const t = 1 - life / 800;
      const alpha = (1 - t) * 0.7;
      ctx.strokeStyle = `rgba(0, 200, 255, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc((pos.x + 1) * TILE_PX, (pos.y + 1) * TILE_PX, TILE_PX * (1 + t), 0, Math.PI * 2);
      ctx.stroke();
    },
  };
}
```

### Visual style notes

These are starting suggestions, not a style bible. The meetup group can iterate on them freely — the data the server provides is enough to support whatever look the team wants.

| Effect           | Suggested duration | Suggested style                              |
|------------------|--------------------|----------------------------------------------|
| Hit flash        | ~150 ms            | White square, fade out                       |
| Explosion        | ~600 ms            | Orange expanding ring, fade out              |
| Spawn pulse      | ~800 ms            | Cyan expanding ring, fade out                |
| Tank tint by HP  | continuous         | hp=3: full color; hp=2: slightly desaturated; hp=1: red-tinted |
| Bullet           | continuous         | Small yellow square                          |

Make it your own.

---

## 9. The Scoreboard

A plain HTML element next to the canvas. Updated by replacing innerHTML on every `STATE` snapshot. There's no need to be clever:

```ts
// src/scoreboard.ts
const el = document.getElementById("scoreboard")!;

export function updateScoreboard(entries: ScoreboardEntry[]) {
  el.innerHTML = entries
    .map(e => `
      <div class="row ${e.state === "dead" ? "dead" : ""}">
        <span class="name">${escape(e.name)}</span>
        <span class="kd">${e.kills}/${e.deaths}</span>
      </div>
    `)
    .join("");
}

function escape(s: string) {
  return s.replace(/[<>&"']/g, c =>
    ({ "<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;", "'":"&#39;" })[c]!
  );
}
```

Sorting comes pre-sorted from the server (kills DESC, deaths ASC). The renderer just paints what it gets.

> **Why innerHTML and not a virtual DOM?** Because we're updating ~10 rows at 30 Hz. The browser handles that without breaking a sweat. Anything fancier is solving a problem we don't have.

---

## 10. The HTML

```html
<!-- client/index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>javascript-in-kyoto</title>
    <link rel="stylesheet" href="./src/style.css" />
  </head>
  <body>
    <div id="layout">
      <canvas id="game" width="640" height="640"></canvas>
      <aside id="scoreboard"></aside>
    </div>
    <script type="module" src="./src/main.ts"></script>
  </body>
</html>
```

That's the whole HTML. One canvas, one sidebar.

---

## 11. Implementation Phases

Aligned to meetup sessions — should be possible to start the renderer in parallel with the server work, since they only need to agree on the protocol (which is locked in `shared/`).

### Session A — Skeleton & Connection
- `pnpm create vite@latest client -- --template vanilla-ts` (or set up by hand)
- Connect to `/renderer`, log every event to the console
- Render a static placeholder so the canvas is visible
- **Goal:** open the page, see "MAP received, STATE received" in DevTools

### Session B — Draw the World
- Implement `drawMap`, `drawTanks`, `drawBullets`
- Wire `requestAnimationFrame` reading from `state.latest`
- **Goal:** open the page with the server running and a test controller connected, see a tank moving on the map

### Session C — Effects & Scoreboard
- Implement `makeHitFlash`, `makeExplosion`, `makeSpawnPulse`
- Implement scoreboard
- **Goal:** kills look like kills; the scoreboard updates live

### Session D — Polish
- HP indicators (bars / tint / however you like)
- Player name labels
- A small connection-status indicator (top-right of the canvas) so users know if the server died
- **Goal:** something you'd actually demo at the meetup

---

## 12. Testing Strategy

Honestly: **the renderer is hard to unit-test and probably not worth heavy testing in v1.**

What we can test cheaply:
- **Pure helpers** — `tileColor(t)`, `tankColor(hp)`, scoreboard-row HTML generation. Unit-test these with Vitest. They're pure functions.
- **The Effect classes** — `advance(dt)` returning false after the lifetime expires can be unit-tested without rendering.

What we should NOT try to unit-test:
- The actual canvas rendering output. Pixel-perfect rendering tests are a tar pit.
- The render loop itself. It's 20 lines of glue; reviewing the code is more valuable than mocking `requestAnimationFrame`.

What we should test by hand at every meetup:
- Connect a controller from `example-controllers/`, watch a tank move.
- Have two controllers shoot each other, watch the kill animation.
- Disconnect a controller, watch the scoreboard update.

Manual smoke-testing is the right tool here.

---

## 13. Open Questions for the First Renderer Meetup

1. **Tile pixel size:** 16px → 640×640 canvas. Try 20px → 800×800 if the meetup room has big monitors.
2. **HP visualization:** three bars, or hearts, or color tint, or all of them? Dealer's choice.
3. **Tank colors:** assign per `playerId` (hash to a hue), or use the player's `skin` field? `skin` is currently a URL — for v1 it's probably easier to ignore it and just hash `playerId` to a color.
4. **Camera:** for v1, the entire 40×40 map fits on screen at 16px/tile. So no camera. Might need scrolling/zoom in v2 if we go bigger.
5. **Connection failure UX:** if the server is down, what does the renderer show? Recommended: a "Disconnected" overlay; Socket.IO's auto-reconnect handles the rest.
6. **Audio:** explicitly out of scope for v1. Easy v2 addition: hit/kill/spawn sounds triggered by the same events that drive the visual effects.
7. **Mobile / responsive:** we're not designing for phones in v1. The `<canvas>` is fixed-size. Accept it.

---

## 14. Non-Goals (Save Your Breath)

Explicitly **out of scope** for the renderer in v1:

- A game engine, a sprite system, or an asset pipeline
- React / Vue / Svelte / any UI framework
- A camera, scrolling, or zoom
- Mobile responsive design
- Audio
- Settings UI / menu screens
- Title screen
- Animations between snapshots (interpolation)
- Replays / recording
- Spectator chat

Any of these makes a great v2 stretch task and a great solo learning project for someone who wants to go deeper.

---

## Next Steps

1. Run `pnpm create vite@latest client -- --template vanilla-ts` (or scaffold by hand)
2. Wire up Vite to import from `shared/` so DTO types are shared with the server
3. Pair up on Session A

The renderer will be done in about half the lines of code of the server. That's by design — the server is doing real work.
