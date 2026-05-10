# 🪖 javascript-in-kyoto

> A real-time multiplayer **tank deathmatch** inspired by the 1985 NES classic *Battle City*, built collaboratively by junior engineers at the **JavaScript in Kyoto** meetup.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-20.x-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Status](https://img.shields.io/badge/status-WIP-orange)]()

---

## 📖 About this project

This is a **learning project** built by and for junior engineers. The goal isn't just to ship a game — it's to practice:

- **Clean Architecture** with clear, enforceable layer boundaries
- **Real-time networking** with WebSockets (via Socket.IO)
- **TypeScript** as a tool for designing systems, not just typing variables
- **Testing** at the unit, integration, and end-to-end levels
- **Working in a team** on a non-trivial codebase

If you're new to any of the above — perfect, that's the point. **PRs from first-timers are explicitly welcome.** See [CONTRIBUTING](#-contributing) below.

If you're an experienced engineer dropping by: please be kind in code review and prefer questions over corrections. This repo is a classroom.

---

## 🎮 The Game

A free-for-all tank deathmatch on a 40×40 tile map. Drive, shoot, take hits, die, respawn, repeat.

- **No teams, no objectives, no win condition.** Everyone vs. everyone, forever.
- **4-directional movement** (no diagonals, classic style).
- **Tanks have 3 HP.** Each bullet does 1 damage.
- **One bullet per tank in flight** at a time.
- **Friendly fire on yourself is impossible** — your own bullets pass through your own tank.
- Shoot through brick walls. Bounce off steel.
- **HP reaches 0 → die → respawn after 20 seconds** at a fresh random location, with full HP.
- The scoreboard tracks **kills** and **deaths**. It is broadcast every tick.
- The server runs **forever**. There is no game over.

Original gameplay reference: [Battle City on Wikipedia](https://en.wikipedia.org/wiki/Battle_City).

---

## 🏛️ Architecture — Read This First

This project uses an **unusual three-role architecture** that is the most important thing to understand before touching any code:

```
                       ┌──────────────────────┐
                       │       SERVER         │
                       │  one endless game,   │
                       │  always running      │
                       └──────────┬───────────┘
                                  │
                       Socket.IO over WebSocket
                       (TWO separate namespaces)
                                  │
              ┌───────────────────┴───────────────────┐
              │                                       │
        ws://host/renderer                     ws://host/controller
              │                                       │
              ▼                                       ▼
        RENDERER(s)                              CONTROLLER(s)
        (lives in client/)                       (write your own)
        "TV screen"                              "5-button joypad"
        draws the world                          presses buttons
        no inputs                                no rendering
```

The protocol is **deliberately asymmetric, and that asymmetry is enforced by the transport itself** — renderers and controllers connect to different namespace URLs. They literally cannot send each other's events.

| Role           | Endpoint                | Sends                | Receives             |
|----------------|-------------------------|----------------------|----------------------|
| **Server**     | (hosts both)            | broadcasts           | inbound events       |
| **Renderer**   | `ws://host/renderer`    | (nothing!)           | `MAP`, `STATE`, `PLAYER_*` |
| **Controller** | `ws://host/controller`  | `REGISTER_USER`, `INPUT` | `REGISTERED`, `YOU_HIT`, `YOU_DIED`, `YOU_SPAWNED` |

**Controllers do NOT receive `STATE`.** They are dumb input devices — 5 buttons (UP, DOWN, LEFT, RIGHT, FIRE) and nothing else. They have no idea where their tank is, what color it is, or who's winning. That's the renderer's job.

> **Why this is cool:** controllers can be Python scripts, Arduino boards with physical buttons, phone apps, voice-command bridges, ML models, dance pads — anything that can speak Socket.IO and emit a `{ up, down, left, right, fire }` payload. Renderers are equally pluggable.

### Players vs. Tanks

Worth getting straight before reading code:

- A **player** is the human (technically, the controller socket). Has a stable `playerId`, name, skin, kill/death count. Persists for as long as the socket is connected.
- A **tank** is the body the player drives. Has 3 HP and a `tankId`. Comes and goes as the player dies and respawns. **Each respawn produces a new `tankId`.** While dead, a player has no tank for 20 seconds.

See [`docs/backend-plan.md`](docs/backend-plan.md) for the full reasoning.

---

## 🗂️ Repository Structure

`javascript-in-kyoto` is a **monorepo** managed with [pnpm workspaces](https://pnpm.io/workspaces). Two top-level packages — no `packages/` indirection.

```
javascript-in-kyoto/
├── server/                  # Node.js + TS + Express + Socket.IO server
│   ├── src/
│   │   ├── domain/          # Pure game rules (no I/O)
│   │   ├── usecase/         # Application logic
│   │   └── adapter/         # Socket.IO + HTTP transport
│   └── map.json             # THE one and only map (40×40 matrix)
│
├── client/                  # Renderer — browser TV screen
│   └── src/
│
├── shared/                  # Shared TS types & event contracts (server ⇄ client)
│   └── src/events.ts
│
├── example-controllers/     # Reference controllers (TS, Python, etc.)
│
├── docs/
│   ├── backend-plan.md      # Server implementation plan
│   ├── renderer-plan.md     # Renderer implementation plan
│   ├── protocol.md          # Wire protocol — for 3rd-party controllers
│   └── architecture.md      # Clean architecture cheat sheet
│
├── package.json             # Workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md                # You are here
```

---

## 🧱 Tech Stack

| Layer        | Choice                                |
|--------------|---------------------------------------|
| Runtime      | Node.js 20 LTS                        |
| Language     | TypeScript 5.x                        |
| HTTP         | Express 4.x                           |
| Real-time    | Socket.IO 4.x (with namespaces)       |
| Validation   | Zod                                   |
| Logging      | pino                                  |
| IDs          | nanoid                                |
| Testing      | Vitest                                |
| Linting      | ESLint + Prettier                     |
| Pkg manager  | pnpm                                  |
| Renderer     | Plain TypeScript + Canvas API + Vite  |

We deliberately avoided heavier tools (Redis, Postgres, NestJS, GraphQL, message brokers) on the server, and we deliberately avoided game engines (PixiJS, Three.js, Phaser) and UI frameworks (React, Vue) in the renderer. The server has zero state worth persisting, and the renderer is a 640×640 canvas drawing colored rectangles — neither needs the extra weight. Restart the server = fresh game. That's a feature.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 20.0.0 ([nvm recommended](https://github.com/nvm-sh/nvm))
- **pnpm** ≥ 9.0.0 → `npm install -g pnpm`
- **Git**

### Setup

```bash
# 1. Clone
git clone https://github.com/<your-org>/javascript-in-kyoto.git
cd javascript-in-kyoto

# 2. Install dependencies (across all workspaces)
pnpm install

# 3. Copy the example env file
cp server/.env.example server/.env

# 4. Start the server in dev mode (auto-reload)
pnpm --filter server dev
```

The server starts on `http://localhost:3000` by default. **The game is now running** — even with zero players connected, the tick loop is ticking. Connect a renderer or a controller to join in.

### Verify it's running

```bash
curl http://localhost:3000/healthz
# → { "status": "ok", "tick": 1247, "players": 0, "renderers": 0 }
```

### Run the renderer

```bash
pnpm --filter client dev
```

Opens the renderer in your browser. It'll connect automatically to `ws://localhost:3000/renderer` and show the live game.

### Connect a quick test controller

```bash
pnpm --filter example-controllers run walker
```

This connects to `/controller`, registers as `"WalkerBot"`, and walks a tank in a circle.

---

## 🎮 Building Your Own Controller

A controller is **shockingly simple** to write. Here's a minimal Node.js example:

```ts
import { io } from "socket.io-client";

// Note the /controller suffix — that's the namespace
const socket = io("http://localhost:3000/controller");

socket.on("connect", () => {
  socket.emit("REGISTER_USER", { name: "Alice" }, (ack) => {
    if (!ack.ok) return console.error("Failed:", ack.code);
    console.log("Player ID:", ack.playerId, "Tank ID:", ack.tankId);
  });
});

// Press FIRE forever
setInterval(() => {
  socket.emit("INPUT", {
    up: false, down: false, left: false, right: false, fire: true,
  });
}, 100);

socket.on("YOU_HIT", ({ hpRemaining, shotBy }) => {
  console.log(`Hit by ${shotBy}! ${hpRemaining} HP left.`);
});

socket.on("YOU_DIED", ({ respawnInMs, killedBy }) => {
  console.log(`Killed by ${killedBy}. Respawning in ${respawnInMs / 1000}s...`);
});

socket.on("YOU_SPAWNED", ({ tankId, position }) => {
  console.log(`Back in the fight! New tank ${tankId} at`, position);
});
```

That's it. No game state, no rendering, no thinking — just buttons. Build a Python version, an Arduino sketch, a phone app, whatever you want.

**Show off your weirdest controller at the next meetup.** 🎮

For full protocol details: [`docs/protocol.md`](docs/protocol.md).

---

## 🧪 Running Tests

```bash
# All tests across all packages
pnpm test

# Just the server
pnpm --filter server test

# Watch mode (TDD-friendly)
pnpm --filter server test:watch

# Coverage
pnpm --filter server test:coverage
```

We aim for:

- **Domain layer:** ~100% coverage (it's pure logic, there's no excuse)
- **Use case layer:** strong coverage with fakes (including a fake clock for the 20s respawn timer)
- **Adapter layer:** key happy-path + error-path integration tests across both namespaces

---

## 🏗️ Server Architecture at a Glance

The `server/` package follows **Clean Architecture**. Dependencies point inward:

```
   adapter  ──►  usecase  ──►  domain
       (arrows = "depends on")
```

- **`server/src/domain/`** — pure game rules. No Express, no Socket.IO, no `fs`. Just types and logic.
- **`server/src/usecase/`** — orchestrates domain entities. Defines ports (interfaces) for things it needs from outside (e.g. `Broadcaster`).
- **`server/src/adapter/`** — implements the ports. Socket.IO namespaces, HTTP routes live here.

We enforce this with ESLint's `no-restricted-paths`. **Breaking the rule will fail CI.** The discipline is the whole point.

For the full architectural rationale, see [`docs/backend-plan.md`](docs/backend-plan.md).

---

## 📡 Wire Protocol (Quick Reference)

Full schemas: [`docs/protocol.md`](docs/protocol.md). Quick version below so you can build a controller in 5 minutes.

### Renderer namespace — `ws://host/renderer`

```
RENDERER  ←  MAP                   (initial map, on connect)
RENDERER  ←  STATE                 (every tick — draw this; includes scoreboard + HP)
RENDERER  ←  PLAYER_JOINED         (someone connected)
RENDERER  ←  PLAYER_LEFT           (someone disconnected)
RENDERER  ←  PLAYER_HIT            (someone took damage but survived; carries position)
RENDERER  ←  PLAYER_KILLED         (someone died; carries position for explosion anchor)
RENDERER  ←  PLAYER_RESPAWNED      (someone returned; carries spawn position)
```

The renderer namespace has **no inbound events** — renderers are receive-only.

### Controller namespace — `ws://host/controller`

```
CONTROLLER  →  REGISTER_USER       { name, skin? }
CONTROLLER  ←  REGISTERED          { playerId, tankId, spawnPosition }
              -- or --
CONTROLLER  ←  REGISTER_REJECTED   { code, message }

CONTROLLER  →  INPUT               { up, down, left, right, fire }
                                   (send on change OR poll — both fine)

CONTROLLER  ←  YOU_HIT             { hpRemaining, shotBy }
CONTROLLER  ←  YOU_DIED            { respawnInMs, killedBy }
CONTROLLER  ←  YOU_SPAWNED         { tankId, position }
```

> **Important:** controllers do NOT receive `STATE`. If you want to see the game, run a renderer alongside your controller.
>
> **Also important:** when you respawn, you get a **new `tankId`** and full HP (3). The stable identifier across deaths is `playerId`.

---

## 🗺️ Roadmap

We're building this across roughly 6 meetup sessions. Tick 'em off as we go.

- [ ] **Session 1** — Project scaffolding (`server/`, `shared/`) & domain layer
- [ ] **Session 2** — Tick loop & terrain collisions
- [ ] **Session 3** — Bullets, HP, hit/kill/respawn pipeline, scoreboard
- [ ] **Session 4** — `/renderer` namespace (MAP + STATE)
- [ ] **Session 5** — `/controller` namespace (REGISTER + INPUT + YOU_* events)
- [ ] **Session 6** — Polish & integration tests
- [ ] **Future** — Sessions on the `client/` browser renderer (see [`docs/renderer-plan.md`](docs/renderer-plan.md)), example controllers in multiple languages, power-ups, forest/ice tiles, spawn protection, HP regen

See [`docs/backend-plan.md`](docs/backend-plan.md) for the detailed breakdown.

---

## 🤝 Contributing

**You're welcome here, especially if this is one of your first OSS contributions.**

### Workflow

1. **Pick an issue** labeled [`good first issue`](../../labels/good%20first%20issue) or [`session-N`](../../labels/) where N is the current session.
2. **Comment on the issue** to claim it — avoids two people doing the same work.
3. **Branch** from `main`: `git checkout -b feat/short-description` or `fix/short-description`.
4. **Code** — keep it small. One logical change per PR.
5. **Test** — `pnpm test` should pass. Add tests for new behavior.
6. **Lint** — `pnpm lint` and `pnpm format` should report clean.
7. **Open a PR** with a clear title and a short description of *what* and *why*.

### Code review etiquette

- Reviewers: lead with questions, not commands. Suggest, don't dictate.
- Authors: it's OK to push back. Disagreement is how we learn.
- Nobody merges their own PR. At least one approval required.

### Commit messages

We loosely follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(server/domain): add HP field to Tank, default 3
fix(server/collision): skip bullets vs their own owner tanks
docs: clarify that respawned tanks get a new tankId
test(server/usecase): cover three-hit kill across multiple ticks
```

Loose ≠ optional. Strict-but-friendly.

---

## 📜 Useful Commands

| Command                                       | What it does                       |
|-----------------------------------------------|------------------------------------|
| `pnpm install`                                | Install everything                 |
| `pnpm --filter server dev`                    | Run server with auto-reload        |
| `pnpm --filter server build`                  | Compile server TypeScript          |
| `pnpm --filter client dev`                    | Run renderer (browser)             |
| `pnpm --filter example-controllers run walker`| Demo controller that walks a tank  |
| `pnpm test`                                   | Run all tests                      |
| `pnpm lint`                                   | ESLint across all packages         |
| `pnpm format`                                 | Prettier across all packages       |
| `pnpm typecheck`                              | `tsc --noEmit` across packages     |

---

## 🆘 Getting Help

- **Stuck on a task?** Drop a message in our meetup chat — no question is too basic.
- **Found a bug?** Open an issue with reproduction steps.
- **Have an idea?** Open an issue tagged `discussion` so we can talk before you code.

---

## 📚 Further Reading

If you're new to any of the concepts in this repo, here are some friendly starting points:

- [Clean Architecture in TypeScript (Khalil Stemmler)](https://khalilstemmler.com/articles/software-design-architecture/organizing-app-logic/)
- [Socket.IO docs — Namespaces](https://socket.io/docs/v4/namespaces/)
- [Game loops 101 (Game Programming Patterns)](https://gameprogrammingpatterns.com/game-loop.html)
- [Zod docs](https://zod.dev/)
- [Original Battle City on Wikipedia](https://en.wikipedia.org/wiki/Battle_City)

---

## 📄 License

[MIT](LICENSE) — do whatever you want, but please share what you learn.

---

<sub>Built with ☕ and a lot of `console.log` debugging by the JavaScript in Kyoto crew.</sub>