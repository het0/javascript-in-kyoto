// Shared DTO types for the Socket.IO protocol.
// Imported by both server/ and client/.

export type Direction = "up" | "down" | "left" | "right";
export type PlayerState = "alive" | "dead";

// ─── Inbound (controller → server) ───────────────────────────────────────────

export type RegisterUserPayload = {
  name: string;
  skin?: string;
};

export type InputPayload = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  fire: boolean;
};

// ─── Outbound to controllers ──────────────────────────────────────────────────

export type RegisteredPayload = {
  playerId: string;
  tankId: string;
  spawnPosition: Position;
};

export type RegisterRejectedPayload = {
  code: "duplicate_name" | "no_spawn" | "invalid_payload" | "already_registered";
  message: string;
};

export type YouHitPayload = {
  hpRemaining: number;
  shotBy: string;
};

export type YouDiedPayload = {
  respawnInMs: number;
  killedBy: string;
};

export type YouSpawnedPayload = {
  tankId: string;
  position: Position;
};

// ─── Outbound to renderers ────────────────────────────────────────────────────

export type Position = {
  x: number;
  y: number;
};

export type MapDto = {
  width: number;
  height: number;
  tiles: number[][];
};

export type TankDto = {
  id: string;
  playerId: string;
  name: string;
  skin?: string;
  x: number;
  y: number;
  direction: Direction;
  isMoving: boolean;
  hp: number;
  bulletId?: string;
};

export type BulletDto = {
  id: string;
  ownerPlayerId: string;
  ownerTankId: string;
  x: number;
  y: number;
  direction: Direction;
};

export type ScoreboardEntry = {
  playerId: string;
  name: string;
  skin?: string;
  kills: number;
  deaths: number;
  state: PlayerState;
};

export type MapDiffEntry = {
  x: number;
  y: number;
  tile: number;
};

export type StateSnapshot = {
  tick: number;
  tanks: TankDto[];
  bullets: BulletDto[];
  scoreboard: ScoreboardEntry[];
  mapDiff: MapDiffEntry[];
};

export type PlayerJoinedPayload = {
  playerId: string;
  name: string;
  skin?: string;
};

export type PlayerLeftPayload = {
  playerId: string;
};

export type PlayerHitPayload = {
  victimPlayerId: string;
  shooterPlayerId: string;
  victimHp: number;
  position: Position;
};

export type PlayerKilledPayload = {
  victimPlayerId: string;
  shooterPlayerId: string;
  victimDeaths: number;
  shooterKills: number;
  position: Position;
};

export type PlayerRespawnedPayload = {
  playerId: string;
  tankId: string;
  position: Position;
};
