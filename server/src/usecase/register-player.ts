import { nanoid } from "nanoid";
import { Player } from "../domain/player.js";
import { Tank } from "../domain/tank.js";
import { trySpawn } from "./spawn.js";
import type { Game } from "../domain/game.js";
import type { Position } from "../domain/position.js";

export type RegisterRequest = {
  socketId: string;
  name: string;
  skin?: string;
};

export type RegisterResult =
  | { ok: true; playerId: string; tankId: string; spawnPosition: Position }
  | { ok: false; code: "duplicate_name" | "no_spawn" | "already_registered" };

export function registerPlayer(game: Game, req: RegisterRequest): RegisterResult {
  // Reject if already registered under this socket
  if (game.findPlayerBySocketId(req.socketId)) {
    return { ok: false, code: "already_registered" };
  }

  // Reject duplicate names (case-insensitive)
  const nameLower = req.name.toLowerCase();
  for (const p of game.players.values()) {
    if (p.name.toLowerCase() === nameLower) {
      return { ok: false, code: "duplicate_name" };
    }
  }

  const spawn = trySpawn(game);
  if (!spawn) return { ok: false, code: "no_spawn" };

  const playerId = nanoid();
  const tankId = nanoid();

  const player = new Player(playerId, req.socketId, req.name, req.skin);
  const tank = new Tank(tankId, playerId, { x: spawn.x, y: spawn.y }, spawn.direction);

  player.tankId = tankId;
  game.players.set(playerId, player);
  game.tanks.set(tankId, tank);

  return { ok: true, playerId, tankId, spawnPosition: { x: spawn.x, y: spawn.y } };
}
