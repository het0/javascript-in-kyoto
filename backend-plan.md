# javascript-in-kyoto — Backend (Server) Implementation Plan

**Project:** `javascript-in-kyoto` — a Battle City deathmatch built at the JavaScript in Kyoto meetup
**Stack:** Node.js · TypeScript · Express · Socket.IO · Clean Architecture
**Audience:** Junior engineers (meetup project)
**Architecture pattern:** Headless game server + dumb renderers + dumb controllers
**Game mode:** Free-for-all deathmatch — no base, no end, no win condition

---

## 0. Architecture in One Picture

```
                          ┌──────────────────────────┐
                          │   SERVER (this folder)   │
                          │                          │
                          │   Single endless game    │
                          │   Tick loop @ 30 Hz      │
                          │   In-memory state        │
                          └────────────┬─────────────┘
                                       │
                          Socket.IO over WebSocket
                       (TWO namespaces, two endpoints)
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │  ws://host/renderer          │           ws://host/controller│
        ▼                              ▼                              ▼
┌───────────────┐             ┌───────────────┐             ┌───────────────┐
│   RENDERER    │             │  CONTROLLER   │             │  CONTROLLER   │
│   (client/)   │             │ (write-only)  │             │ (write-only)  │
│               │             │               │             │               │
│ Receives:     │             │ Sends:        │             │ Sends:        │
│   STATE       │             │   REGISTER    │             │   REGISTER    │
│   MAP         │             │   INPUT       │             │   INPUT       │
│   PLAYER_*    │             │               │             │               │
│               │             │ Receives:     │             │ Receives:     │
│ Sends:        │             │   REGISTERED  │             │   REGISTERED  │
│   (nothing)   │             │   YOU_HIT     │             │   YOU_HIT     │
│               │             │   YOU_DIED    │             │   YOU_DIED    │
│ "TV screen"   │             │   YOU_SPAWNED │             │   YOU_SPAWNED │
│               │             │   (no STATE!) │             │   (no STATE!) │
└───────────────┘             └───────────────┘             └───────────────┘
   N renderers                  N controllers                 N controllers
```

The **renderer** lives in the `client/` directory of this repo. **Controllers** are external — anyone can write one in any language as long as it speaks the protocol.

The protocol is asymmetric, and that asymmetry is enforced at the transport layer by using two separate Socket.IO namespaces. A controller cannot accidentally receive `STATE` because it physically isn't connected to the renderer namespace. A renderer cannot accidentally send `INPUT` because that handler doesn't exist on the renderer namespace.

---

## 1. Game Design

### 1.1 Deathmatch rules

- Free-for-all PvP. Everyone vs. everyone.
- Tanks have **3 HP**. Each bullet hit costs **1 HP**.
- HP reaches 0 → tank destroyed, player marked dead, **respawn after 20 seconds** at a new random location.
- Respawned tanks come back with **full HP (3)**.
- The shooter gets **+1 kill** when their hit reduces a tank's HP to 0.
- **Friendly fire on yourself is not possible** — your own bullets pass through your own tank.
- **There is no game over.** The game runs forever. The server never resets.

### 1.2 Map elements

40×40 tile matrix. Same vocabulary as classic Battle City, **minus the base**:

| Key | Element | Blocks tank? | Blocks bullet? | Destructible? | v1? |
|-----|---------|--------------|----------------|---------------|-----|
| `0` | Empty / ground | No | No | — | ✅ |
| `1` | Brick wall | Yes | Yes | Yes (1 hit) | ✅ |
| `2` | Steel wall | Yes | Yes | No | ✅ |
| `3` | Water | Yes | No | No | ✅ |
| `4` | Forest / bushes | No | No | No | v2 |
| `5` | Ice (sliding) | No (slides) | No | No | v2 |

> The `Base` tile (was key `6`) is **removed**. The map loader rejects key `6` with a clear error.

### 1.3 Entities

- **Player tanks** — one per registered controller. Have HP. Disappear on death. Reappear after 20s with full HP.
- **Bullets** — ephemeral, one per *living* tank in flight at a time. Carry their owner's `playerId` for friendly-fire immunity.

> **Architectural rule:** the map matrix holds **terrain only**. Tanks and bullets live separately with sub-tile float coordinates.

### 1.4 Core mechanics for v1

- 4-directional movement (no diagonals)
- Tank occupies **2×2 tiles**
- One bullet per living tank in flight
- Bullet damages: any tank that isn't its owner (−1 HP)
- Bullet destroys: brick (1 hit)
- Bullet stops at: steel
- Bullet **passes through**: its own owner

---

## 2. Critical Architecture Decisions (Read These First)

### 2.1 Single endless game session

There is **no lobby, no game ID, no game over, no reset**. The server boots once. The game runs until the server stops.

### 2.2 The tick loop runs forever

Loop starts when the server starts and never stops. Zero players? Loop still ticks.

### 2.3 Two Socket.IO namespaces, role decided at connect time

| Namespace             | Role        | What can be sent here?    | What gets broadcast here? |
|-----------------------|-------------|---------------------------|---------------------------|
| `ws://host/renderer`  | Renderer    | (nothing)                 | `MAP`, `STATE`, `PLAYER_*` |
| `ws://host/controller`| Controller  | `REGISTER_USER`, `INPUT`  | (per-socket `YOU_*` events only) |

> **Why namespaces over rooms?** [Socket.IO namespaces](https://socket.io/docs/v4/namespaces/) give us *transport-level* role separation: each namespace has its own event handlers, connection callback, broadcast scope. A renderer cannot impersonate a controller and vice versa. Rooms (which we'd use within a namespace if we needed sub-grouping) are for sub-grouping clients of the *same role*. We don't need that — every renderer is broadcast-equal and every controller is broadcast-equal — so we don't use rooms at all in v1.

### 2.4 Player ID = stable across deaths

The mapping `socket.id → playerId` is set once on `REGISTER_USER`. The `playerId` survives deaths and respawns. The `tankId` does **not** — every respawn yields a new tank with a new `tankId`. Stable identifiers help renderers track players over time.

> **Why drop scores on disconnect?** It's a meetup project, not a ranked ladder. Disconnect = player record removed. No persistence, no auth tokens. Score persistence is a v2 conversation.

### 2.5 Player vs. Tank — a useful distinction

- **Player** — the *human* (controller socket). Has `playerId`, `name`, `skin`, `kills`, `deaths`, `state` (`alive` | `dead`). Lives as long as the socket is connected.
- **Tank** — the *body* the player drives. Has `tankId`, position, direction, **HP**, owner reference. Comes and goes as the player dies and respawns.

This split shows up everywhere: `PLAYER_JOINED` / `PLAYER_LEFT` are about humans; `YOU_DIED` / `YOU_SPAWNED` and the `tanks[]` array in `STATE` are about bodies.

### 2.6 Damage + death + respawn timeline

```
   bullet hits tank
   ├─ Is it the tank's own bullet? → bullet passes through, no effect
   ├─ Otherwise → tank.hp -= 1
   │
   ├─ if tank.hp > 0:    (non-fatal hit)
   │    ├─ broadcast PLAYER_HIT to renderers
   │    └─ emit YOU_HIT to the victim's socket
   │
   └─ if tank.hp === 0:  (kill)
        ├─ remove tank from game.tanks
        ├─ player.state = "dead"
        ├─ player.respawnsAt = now + 20s
        ├─ shooter.kills += 1
        ├─ victim.deaths += 1
        ├─ broadcast PLAYER_KILLED to renderers
        └─ emit YOU_DIED to the victim's socket

   t + 20s
   └─ tick loop notices respawnsAt expired
        ├─ find a fresh random spawn (rejects spots near living tanks)
        ├─ create new Tank with NEW tankId, hp=3
        ├─ player.state = "alive", player.tankId = newId
        ├─ broadcast PLAYER_RESPAWNED to renderers
        └─ emit YOU_SPAWNED to the player's socket
```

### 2.7 Friendly-fire immunity

Bullets carry their owner's `playerId`. During collision detection:

```
for each bullet:
  for each tank:
    if bullet.ownerPlayerId === tank.playerId: continue   // pass through
    if AABB_overlaps(bullet, tank):
      apply_damage(tank, bullet)
      remove bullet
```

The owner check happens *before* the AABB check, so it's both correct and cheap.

### 2.8 INPUT model: raw button state

A controller emits `{ up, down, left, right, fire }` — current state of 5 buttons. The server stores latest state per *player* and reads it each tick. Edge-triggered or polled — server doesn't care. Dead players' inputs are stored but ignored by the tick loop.

---

## 3. Technology Choices

| Concern | Choice | Why |
|---------|--------|-----|
| Runtime | Node.js 20 LTS | Stable, familiar |
| Language | TypeScript 5.x | Type safety enforces architecture |
| HTTP server | Express 4.x | For `/healthz` |
| Real-time | Socket.IO 4.x | Namespaces, reconnection, acks all built-in |
| Validation | Zod | Runtime validation of inbound events |
| Logging | pino | Fast, structured |
| IDs | nanoid | For player and tank IDs |
| Testing | Vitest | TS-native |
| Linting | ESLint + Prettier | Standard |

**Deliberately avoided:** Redis, Postgres, NestJS, GraphQL, message brokers.

---

## 4. Repository Layout

`javascript-in-kyoto` is a monorepo with **two top-level packages: `server` and `client`** — no `packages/` indirection, since with only two siblings it's just visual noise.

```
javascript-in-kyoto/
├── server/                         # ← THIS PLAN COVERS THIS FOLDER
│   ├── src/
│   │   ├── index.ts                # Entry: load map, start loop, start server
│   │   │
│   │   ├── domain/                 # INNERMOST — pure rules, no I/O
│   │   │   ├── tile.ts             # TileType enum (no Base!)
│   │   │   ├── map.ts              # GameMap class
│   │   │   ├── tank.ts             # Tank entity (with HP)
│   │   │   ├── bullet.ts           # Bullet entity (with ownerPlayerId)
│   │   │   ├── player.ts           # Player (human) — kills/deaths/state
│   │   │   ├── game.ts             # Game aggregate (the singleton)
│   │   │   ├── direction.ts
│   │   │   ├── position.ts
│   │   │   ├── input-state.ts      # 5-button state
│   │   │   └── errors.ts
│   │   │
│   │   ├── usecase/
│   │   │   ├── register-player.ts  # REGISTER_USER → spawn player + tank
│   │   │   ├── handle-input.ts
│   │   │   ├── disconnect.ts
│   │   │   ├── tick.ts
│   │   │   ├── game-loop.ts
│   │   │   ├── spawn.ts            # Find random valid spawn position
│   │   │   ├── respawn.ts
│   │   │   ├── damage.ts           # Apply damage, emit HIT or KILL
│   │   │   ├── collision.ts        # Includes friendly-fire skip
│   │   │   └── ports.ts            # Broadcaster interface
│   │   │
│   │   ├── adapter/
│   │   │   ├── socketio/
│   │   │   │   ├── server.ts       # Sets up io, /renderer + /controller namespaces
│   │   │   │   ├── renderer-namespace.ts
│   │   │   │   ├── controller-namespace.ts
│   │   │   │   ├── schemas.ts      # Zod schemas
│   │   │   │   ├── messages.ts     # Outbound DTO types
│   │   │   │   └── broadcaster.ts  # Implements Broadcaster port
│   │   │   │
│   │   │   └── http/
│   │   │       ├── app.ts
│   │   │       └── routes/
│   │   │           └── health.ts
│   │   │
│   │   └── config/
│   │       └── env.ts
│   │
│   ├── map.json                    # THE map — single file, no base tile
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md                   # Server-specific docs
│
├── client/                         # Renderer (separate plan)
│   └── ...
│
├── shared/                         # Shared types & event contracts
│   ├── src/
│   │   └── events.ts               # Inbound/outbound DTO types, Zod schemas
│   ├── package.json
│   └── tsconfig.json
│
├── example-controllers/            # Reference controllers (TS, Python, etc.)
│   └── ...
│
├── docs/
│   ├── backend-plan.md             # This file
│   ├── renderer-plan.md            # (coming soon)
│   ├── protocol.md                 # Wire protocol reference
│   └── architecture.md             # Clean architecture cheat sheet
│
├── package.json                    # Workspace root
├── pnpm-workspace.yaml             # Lists: server, client, shared, example-controllers
├── tsconfig.base.json
└── README.md                       # Project README
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - "server"
  - "client"
  - "shared"
  - "example-controllers"
```

What's **not** in `server/`: no `maps/` directory, no `repository/`, no `reset-game.ts`, no `identify-renderer.ts`, no rooms helper.

### Dependency rule

```
adapter  ──►  usecase  ──►  domain
```

Enforce with ESLint `no-restricted-paths` — will fail CI if violated.

---

## 5. Domain Model

```ts
// server/src/domain/tile.ts
export enum TileType {
  Empty  = 0,
  Brick  = 1,
  Steel  = 2,
  Water  = 3,
  Forest = 4,  // v2
  Ice    = 5,  // v2
  // 6 (Base) intentionally omitted — deathmatch only.
}

// server/src/domain/input-state.ts
export type InputState = {
  up: boolean; down: boolean; left: boolean; right: boolean; fire: boolean;
};
export const NEUTRAL: InputState = { up:false, down:false, left:false, right:false, fire:false };

// server/src/domain/player.ts
export type PlayerState = "alive" | "dead";

export class Player {
  readonly id: string;          // stable across deaths
  readonly socketId: string;
  name: string;
  skin?: string;
  kills: number = 0;
  deaths: number = 0;
  state: PlayerState = "alive";
  respawnsAt?: number;          // epoch ms
  inputState: InputState = NEUTRAL;
  tankId?: string;              // present iff alive
}

// server/src/domain/tank.ts
export const MAX_HP = 3;

export class Tank {
  readonly id: string;          // NEW id every respawn
  readonly playerId: string;
  hp: number = MAX_HP;
  position: Position;
  direction: Direction;
  isMoving: boolean;
  bulletId?: string;            // their in-flight bullet, if any
}

// server/src/domain/bullet.ts
export class Bullet {
  readonly id: string;
  readonly ownerPlayerId: string;   // for friendly-fire immunity
  readonly ownerTankId: string;
  position: Position;
  direction: Direction;
}

// server/src/domain/game.ts
export class Game {
  readonly map: GameMap;
  readonly players = new Map<string, Player>();   // playerId → Player
  readonly tanks   = new Map<string, Tank>();     // tankId   → Tank
  readonly bullets = new Map<string, Bullet>();
  tick: number = 0;
}
```

---

## 6. The Map

`server/map.json`:

```json
{
  "width": 40,
  "height": 40,
  "tiles": [
    [0, 0, 0, 0, /* ... 40 values ... */],
    [0, 1, 1, 0, /* ... 40 values ... */]
    /* 40 rows total */
  ]
}
```

The loader:

1. Validates exactly 40×40.
2. Validates every value is in `{0, 1, 2, 3, 4, 5}` — **rejects `6`** with a clear error.

### Spawn algorithm (used for both initial spawn and respawn)

In `server/src/usecase/spawn.ts`:

1. Pick random `(x, y)` where the 2×2 tank footprint fits on `Empty` tiles.
2. Reject spots within N tiles of any *living* tank.
3. Reject spots where a bullet is in flight nearby.
4. Give up after K attempts. Initial spawn → `REGISTER_REJECTED` with `no_spawn`. Respawn → push respawn time forward by 1s and try again next tick.

---

## 7. The Game Loop

```ts
// server/src/usecase/game-loop.ts
const TICK_RATE = 30;
const TICK_MS = 1000 / TICK_RATE;
const RESPAWN_DELAY_MS = 20_000;

export class GameLoop {
  private interval?: NodeJS.Timeout;

  constructor(
    private game: Game,
    private broadcaster: Broadcaster,
    private now: () => number = Date.now,
  ) {}

  start() { this.interval = setInterval(() => this.tick(), TICK_MS); }

  setInputState(playerId: string, state: InputState) {
    const player = this.game.players.get(playerId);
    if (player) player.inputState = state;
  }

  registerPlayer(req: RegisterRequest): RegisterResult { /* ... */ }
  removePlayer(socketId: string)              { /* ... */ }

  private tick() {
    this.game.tick++;

    // 1. Respawn anyone whose timer expired
    this.processRespawns();

    // 2. Apply alive players' inputs
    for (const player of this.game.players.values()) {
      if (player.state !== "alive") continue;
      this.game.applyInput(player);
    }

    // 3. Advance entities
    this.game.advanceTanks();
    this.game.advanceBullets();

    // 4. Resolve collisions — produces hit/kill events
    const events = this.game.resolveCollisions();
    for (const ev of events) {
      if (ev.type === "tank_hit")    this.handleHit(ev);
      if (ev.type === "tank_killed") this.handleKill(ev);
      // ...other event types
    }

    // 5. Broadcast STATE to renderers
    this.broadcaster.broadcastState(this.game.snapshot());
  }

  private handleHit(ev: TankHitEvent) {
    const victim  = this.game.players.get(ev.victimPlayerId)!;
    const shooter = this.game.players.get(ev.shooterPlayerId)!;
    const tank    = this.game.tanks.get(victim.tankId!)!;
    this.broadcaster.broadcastPlayerHit({
      victimPlayerId: victim.id,
      shooterPlayerId: shooter.id,
      victimHp: ev.victimHpAfter,
      position: { x: tank.position.x, y: tank.position.y },
    });
    this.broadcaster.emitToPlayer(victim, "YOU_HIT", {
      hpRemaining: ev.victimHpAfter,
      shotBy: shooter.name,
    });
  }

  private handleKill(ev: TankKilledEvent) {
    const victim  = this.game.players.get(ev.victimPlayerId)!;
    const shooter = this.game.players.get(ev.shooterPlayerId)!;
    const tank    = this.game.tanks.get(victim.tankId!)!;
    const deathPosition = { x: tank.position.x, y: tank.position.y };  // capture BEFORE removing the tank!

    victim.deaths += 1;
    victim.state = "dead";
    victim.respawnsAt = this.now() + RESPAWN_DELAY_MS;
    this.game.removeTank(victim.tankId!);
    victim.tankId = undefined;

    shooter.kills += 1;

    this.broadcaster.broadcastPlayerKilled({
      victimPlayerId: victim.id,
      shooterPlayerId: shooter.id,
      victimDeaths: victim.deaths,
      shooterKills: shooter.kills,
      position: deathPosition,
    });
    this.broadcaster.emitToPlayer(victim, "YOU_DIED", {
      respawnInMs: RESPAWN_DELAY_MS,
      killedBy: shooter.name,
    });
  }

  private processRespawns() {
    for (const player of this.game.players.values()) {
      if (player.state !== "dead") continue;
      if (player.respawnsAt! > this.now()) continue;

      const pos = trySpawn(this.game);
      if (!pos) {
        player.respawnsAt = this.now() + 1000;   // try again in 1s
        continue;
      }

      const tank = this.game.spawnTankFor(player, pos);   // creates Tank with hp=3
      player.state = "alive";
      player.tankId = tank.id;
      player.respawnsAt = undefined;

      this.broadcaster.broadcastPlayerRespawned({ playerId: player.id, tankId: tank.id, position: pos });
      this.broadcaster.emitToPlayer(player, "YOU_SPAWNED", { tankId: tank.id, position: pos });
    }
  }
}
```

### Notes
- `now` is injected so tests can use a fake clock (don't sleep 20 seconds in tests!).
- Hit and kill events are produced by `resolveCollisions()` and consumed by the loop. The actual HP mutation happens inside collision resolution.
- Respawn checks run at the start of the tick so a freshly-respawned tank can act this same tick.

### Friendly-fire skip in collision detection

```ts
// server/src/usecase/collision.ts (simplified)
function checkBulletVsTank(bullet: Bullet, tank: Tank): TankHitEvent | TankKilledEvent | null {
  if (bullet.ownerPlayerId === tank.playerId) return null;   // friendly-fire immunity
  if (!aabbOverlap(bullet, tank)) return null;

  tank.hp -= 1;
  if (tank.hp > 0) {
    return { type: "tank_hit", victimPlayerId: tank.playerId,
             shooterPlayerId: bullet.ownerPlayerId, victimHpAfter: tank.hp };
  }
  return { type: "tank_killed", victimPlayerId: tank.playerId,
           shooterPlayerId: bullet.ownerPlayerId };
}
```

---

## 8. Socket.IO Protocol

### 8.1 Two namespaces

```ts
// server/src/adapter/socketio/server.ts
import { Server } from "socket.io";

export function setupSocketIO(httpServer, loop, game) {
  const io = new Server(httpServer, { /* CORS etc. */ });

  registerRendererNamespace(io.of("/renderer"), game);
  registerControllerNamespace(io.of("/controller"), loop);

  return io;
}
```

Renderers connect to `ws://host/renderer`, controllers to `ws://host/controller`.

### 8.2 Renderer namespace

#### Lifecycle

```
client connects to /renderer
    │
    ├─► server immediately sends MAP and STATE snapshot
    │
    ├─► server broadcasts STATE every tick
    ├─► server broadcasts PLAYER_* events as they happen
    │
    └─► client disconnects (no cleanup needed)
```

#### Inbound: nothing.

The renderer namespace **has no client→server event handlers**. A renderer is purely receive-only.

#### Outbound (broadcast to all renderer clients)

| Event              | Payload                                       | When |
|--------------------|-----------------------------------------------|------|
| `MAP`              | `{ width, height, tiles }`                    | On connect |
| `STATE`            | `{ tick, tanks[], bullets[], scoreboard[], mapDiff[] }` | Every tick |
| `PLAYER_JOINED`    | `{ playerId, name, skin? }`                   | On registration |
| `PLAYER_LEFT`      | `{ playerId }`                                | On disconnect |
| `PLAYER_HIT`       | `{ victimPlayerId, shooterPlayerId, victimHp, position }` | On non-fatal hit |
| `PLAYER_KILLED`    | `{ victimPlayerId, shooterPlayerId, victimDeaths, shooterKills, position }` | On kill |
| `PLAYER_RESPAWNED` | `{ playerId, tankId, position }`              | On respawn |

The `position` field on hit/kill/respawn events is the **last-known tile coordinate** of the affected tank at the moment of the event. The renderer needs this to anchor visual effects (hit flash, explosion, spawn-in animation) at the right spot — especially for kills, since the tank disappears from `STATE.tanks[]` immediately and the renderer would otherwise have nothing to draw the explosion against.

```ts
// server/src/adapter/socketio/renderer-namespace.ts
export function registerRendererNamespace(nsp: Namespace, game: Game) {
  nsp.on("connection", (socket) => {
    socket.emit("MAP", game.mapDto());
    socket.emit("STATE", game.snapshot());
    // No event handlers — renderers are receive-only.
  });
}
```

### 8.3 Controller namespace

#### Lifecycle

```
client connects to /controller
    │
    ├─► client sends REGISTER_USER ──► player + tank created, REGISTERED ack
    │
    ├─► client sends INPUT events
    ├─► server may emit YOU_HIT, YOU_DIED, YOU_SPAWNED to this socket
    │
    └─► client disconnects ──► player + tank (if any) removed
```

#### Inbound (controller → server)

| Event           | Payload                                                  |
|-----------------|----------------------------------------------------------|
| `REGISTER_USER` | `{ name: string, skin?: string }`                        |
| `INPUT`         | `{ up, down, left, right, fire }` — all booleans         |

#### Outbound (server → specific controller socket)

> The controller namespace does NOT broadcast. Every event is targeted at one socket.

| Event              | Payload                                            | When |
|--------------------|----------------------------------------------------|------|
| `REGISTERED`       | `{ playerId, tankId, spawnPosition }`              | On successful `REGISTER_USER` |
| `REGISTER_REJECTED`| `{ code, message }`                                | On failed `REGISTER_USER` |
| `YOU_HIT`          | `{ hpRemaining, shotBy }`                          | When this player's tank takes a non-fatal hit |
| `YOU_DIED`         | `{ respawnInMs, killedBy }`                        | When this player's tank dies |
| `YOU_SPAWNED`      | `{ tankId, position }`                             | When this player respawns |

```ts
// server/src/adapter/socketio/controller-namespace.ts
export function registerControllerNamespace(nsp: Namespace, loop: GameLoop) {
  nsp.on("connection", (socket) => {

    socket.on("REGISTER_USER", (raw, ack) => {
      const parsed = RegisterUserSchema.safeParse(raw);
      if (!parsed.success) return ack?.({ ok: false, code: "invalid_payload" });

      const result = loop.registerPlayer({
        socketId: socket.id,
        name: parsed.data.name,
        skin: parsed.data.skin,
      });
      if (!result.ok) return ack?.({ ok: false, code: result.code });

      socket.data.playerId = result.playerId;
      ack?.({
        ok: true,
        playerId: result.playerId,
        tankId: result.tankId,
        spawnPosition: result.spawnPosition,
      });
    });

    socket.on("INPUT", (raw) => {
      if (!socket.data.playerId) return;          // not registered yet
      const parsed = InputSchema.safeParse(raw);
      if (!parsed.success) return;
      loop.setInputState(socket.data.playerId, parsed.data);
    });

    socket.on("disconnect", () => {
      if (socket.data.playerId) loop.removePlayer(socket.id);
    });
  });
}
```

### 8.4 Validation with Zod

```ts
// server/src/adapter/socketio/schemas.ts
export const RegisterUserSchema = z.object({
  name: z.string().trim().min(1).max(20),
  skin: z.string().url().max(500).optional(),
});

export const InputSchema = z.object({
  up: z.boolean(), down: z.boolean(),
  left: z.boolean(), right: z.boolean(),
  fire: z.boolean(),
});
```

### 8.5 The Broadcaster

```ts
// server/src/adapter/socketio/broadcaster.ts
export class SocketIOBroadcaster implements Broadcaster {
  constructor(
    private rendererNsp: Namespace,
    private controllerNsp: Namespace,
    private players: Map<string, Player>,
  ) {}

  broadcastState(snap: StateSnapshot) {
    this.rendererNsp.emit("STATE", snap);
  }

  broadcastMap(map: MapDto) {
    this.rendererNsp.emit("MAP", map);
  }

  broadcastPlayerJoined(p: PlayerDto)             { this.rendererNsp.emit("PLAYER_JOINED", p); }
  broadcastPlayerLeft(playerId: string)           { this.rendererNsp.emit("PLAYER_LEFT", { playerId }); }
  broadcastPlayerHit(p: PlayerHitPayload)         { this.rendererNsp.emit("PLAYER_HIT", p); }
  broadcastPlayerKilled(p: PlayerKilledPayload)   { this.rendererNsp.emit("PLAYER_KILLED", p); }
  broadcastPlayerRespawned(p: PlayerRespawnedPayload) { this.rendererNsp.emit("PLAYER_RESPAWNED", p); }

  emitToPlayer(player: Player, event: string, payload: unknown) {
    this.controllerNsp.to(player.socketId).emit(event, payload);
  }
}
```

There is no `broadcastToControllers` method. The controller namespace is per-socket only.

---

## 9. State Snapshot Shape

```ts
type StateSnapshot = {
  tick: number;
  tanks: Array<{
    id: string;            // tank id (changes on respawn)
    playerId: string;      // stable owner id
    name: string;
    skin?: string;
    x: number;
    y: number;
    direction: "up" | "down" | "left" | "right";
    isMoving: boolean;
    hp: number;            // 0..3 — for renderer health bars
    bulletId?: string;
  }>;
  bullets: Array<{
    id: string;
    ownerPlayerId: string;
    ownerTankId: string;
    x: number;
    y: number;
    direction: "up" | "down" | "left" | "right";
  }>;
  scoreboard: Array<{
    playerId: string;
    name: string;
    skin?: string;
    kills: number;
    deaths: number;
    state: "alive" | "dead";
  }>;
  mapDiff: Array<{ x: number; y: number; tile: number }>;
};
```

Dead players are in `scoreboard` but **not** in `tanks[]`.

The DTO types live in `shared/src/events.ts` and are imported by both `server/` and `client/`.

---

## 9.1 What the Renderer Has to Work With

A heads-up for renderer authors (in `client/`) and for everyone reviewing renderer PRs: this section lists the **visual signals available** from the protocol, without prescribing any particular look. Style and animation choices belong in the renderer plan — but those choices have to fit within the data we actually send.

### Continuous signals (every tick, in `STATE`)
- **`tank.hp` (0..3)** — current health for every alive tank. The renderer is free to express this however it wants: a three-segment bar, three hearts, a color tint that goes red as HP drops, a smoke trail that gets thicker, a scoreboard column, all of the above. The server has no opinion. The only contract is that `0 < hp <= 3` while alive and that a tank disappears from `STATE.tanks[]` when killed.
- **`tank.x`, `tank.y`, `direction`, `isMoving`** — for animating treads, turret rotation, idle vs. driving.
- **`scoreboard[]`** — kills, deaths, and `state: "alive" | "dead"` for every connected player. Dead players will be present here for ~20s but absent from `tanks[]` during that time. The renderer can grey out their row, show "respawning…", or whatever else.

### One-shot signals (events)
These are **fire-and-forget**: the renderer treats them as triggers for transient effects (sounds, particles, screen shake). Each carries a `position` so the renderer knows where to anchor the effect.

| Event              | Fires when         | Use it for (suggestions, not requirements)                |
|--------------------|--------------------|-----------------------------------------------------------|
| `PLAYER_HIT`       | Tank takes damage but survives | hit flash, spark particles, hit sound, brief shake of victim's tank |
| `PLAYER_KILLED`    | Tank's HP reaches 0 | explosion sprite/animation, debris, kill sound, screen flash |
| `PLAYER_RESPAWNED` | Dead player's 20s timer expires | spawn-in animation, brief invulnerability pulse, "ready" sound |
| `PLAYER_JOINED`    | New controller registers | small UI ping ("Alice joined"), scoreboard insertion animation |
| `PLAYER_LEFT`      | Controller disconnects | scoreboard removal animation |

### What the renderer must NOT rely on
- **Server-driven visual timings.** Hit flashes, explosion durations, spawn-in pulses — those are renderer-local timers. The server emits one event and moves on. If the renderer drops a frame or the connection hiccups, it should still recover gracefully.
- **Animation state in `STATE`.** There is no "tank is currently exploding" flag. Once a tank dies, it's gone from `STATE.tanks[]`. The kill event told you where; the renderer remembers it for as long as its explosion animation runs.
- **Order between event and STATE.** A `PLAYER_KILLED` event and the `STATE` snapshot where that tank is missing are sent in the same tick, but ordering across the wire isn't strictly guaranteed. Renderers should be defensive: if a tank is in `STATE.tanks[]` one tick and gone the next without a `PLAYER_KILLED` for it, treat it as a kill anyway (or as the player having disconnected).

### Designing the renderer around this
The renderer is intentionally event-driven on top of a state-driven world. Continuous things (where tanks are, current HP) come from `STATE`. Punctual things (a hit happened, a tank exploded) come from events. **Don't try to derive events from STATE diffs** — that's what the events are for, and they're more reliable.

---

## 10. Implementation Phases (Meetup Sessions)

### Session 1 — Foundation & Domain
- Scaffold monorepo: root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
- Create `server/`, `shared/`, and stub `client/`
- ESLint + Prettier + Vitest at the root
- `server/src/domain/`: `GameMap`, `Tank` (with HP), `Bullet` (with ownerPlayerId), `Player`, `Position`, `Direction`, `InputState`, `Game`
- Load `server/map.json` at startup (validate no `6`s)
- **Goal:** unit tests pass for domain types and map loading

### Session 2 — Tick Loop & Movement
- `server/src/usecase/tick.ts`, `game-loop.ts`
- Tank movement based on `InputState`, terrain collision
- Input conflict resolution
- **Goal:** simulated input drives tanks around walls in unit tests

### Session 3 — Bullets, HP, Hits, Kills, Respawn
- Bullet physics
- Friendly-fire immunity
- Damage application (3 HP → hit/kill events)
- Respawn timer + spawn rejection retry
- **Goal:** unit tests verify the full damage→hit→kill→respawn timeline using a fake clock

### Session 4 — Renderer Namespace
- Express + Socket.IO setup in `server/`
- `/renderer` namespace: send `MAP` + `STATE` on connect, broadcast every tick
- **Goal:** a `socket.io-client` connecting to `/renderer` receives `STATE` in real time

### Session 5 — Controller Namespace
- `/controller` namespace: `REGISTER_USER`, `INPUT`
- `YOU_HIT`, `YOU_DIED`, `YOU_SPAWNED` per-socket events
- `PLAYER_HIT`, `PLAYER_KILLED`, `PLAYER_RESPAWNED` broadcasts to renderers
- **Goal:** two test controllers can shoot each other; a test renderer sees the events

### Session 6 — Polish & Integration Tests
- Graceful shutdown, basic logging, `/healthz`
- Mixed end-to-end Vitest tests (renderers + controllers across both namespaces)
- Document the protocol in `docs/protocol.md`
- **Goal:** stable server, ready for the `client/` package and external controllers

---

## 11. Testing Strategy

- **Domain (unit):** pure functions. `GameMap`, AABB collision, friendly-fire skip, scoreboard sorting, input translation. Lightning fast.
- **Use case (unit with fakes):** `FakeBroadcaster`, `FakeClock`. Drive `tick()` directly. Test the hit→kill→respawn pipeline with a 20s respawn that runs in microseconds.
- **Adapter (integration):** real Socket.IO server on an ephemeral port. Spawn `socket.io-client`s connecting to BOTH `/renderer` and `/controller`. Verify messages flow correctly across namespaces.

The fake clock is non-negotiable — testing 20-second respawns in real time would make CI take forever.

---

## 12. Open Questions for the First Meetup

1. **Tick rate:** 30 Hz default. Is 60 overkill? Is 20 too choppy?
2. **Tank size:** 2×2 tiles (classic) or 1×1 (simpler collisions)?
3. **Bullet speed:** how many tiles per tick? (Original was ~2× tank speed.)
4. **Spawn protection:** invulnerable for 2 seconds after spawn? Renderer would need an `isInvulnerable` flag in `STATE.tanks[]`.
5. **HP regeneration:** should HP slowly regen between hits, or only on respawn? Recommended: only on respawn — keeps it deathmatch-y.
6. **Conflict resolution:** UP+DOWN both pressed → which wins? Recommended: most recently changed; tiebreak `up > down > left > right`.
7. **Name uniqueness:** reject duplicates, or auto-suffix `Alice (2)`?
8. **`skin` URL:** validate format / length?
9. **Score cap / session length:** infinite play in v1, or reset scoreboard at some point?
10. **Bullets after death:** when an owner dies with a bullet still in flight, does the bullet keep flying (and possibly score a posthumous kill) or is it removed? Recommended: keeps flying; "your last shot still counts" feels good.

---

## 13. Non-Goals (Save Your Breath)

Explicitly **out of scope**:

- Lobbies, matchmaking, multiple concurrent games
- Map editor, multiple maps, level progression
- Enemy AI, bots, simulations
- The eagle base
- Win conditions, game-over states
- Persistent player accounts, persistent leaderboards
- Power-ups
- Forest and ice tiles (v2)
- HP regeneration mid-life (v2 maybe)
- Sound (renderer concern)
- Anti-cheat / rate limiting on `INPUT` (v2)

---

## Next Steps

1. Agree on this plan at session 0
2. Scaffold the repo: root workspace files, `server/`, `shared/`
3. First contributor: hand-paint `server/map.json` (40×40 of tiles 0–3)
4. Pair up on Session 1

The renderer (`client/`) plan is next. It will be intentionally tiny — the renderer is, by design, a dumb display device.
