import { nanoid } from "nanoid";
import { Tank } from "../domain/tank.js";
import { trySpawn } from "./spawn.js";
import type { Game } from "../domain/game.js";
import type { Player } from "../domain/player.js";
import type { Position } from "../domain/position.js";

export type RespawnResult =
  | { respawned: true; tankId: string; position: Position }
  | { respawned: false; retryAt: number };

export function processRespawn(game: Game, player: Player, now: number): RespawnResult {
  const spawn = trySpawn(game);
  if (!spawn) {
    return { respawned: false, retryAt: now + 1000 };
  }

  const tankId = nanoid();
  const tank = new Tank(tankId, player.id, { x: spawn.x, y: spawn.y }, spawn.direction);

  game.tanks.set(tankId, tank);
  player.tankId = tankId;
  player.state = "alive";
  player.respawnsAt = undefined;

  return { respawned: true, tankId, position: { x: spawn.x, y: spawn.y } };
}
