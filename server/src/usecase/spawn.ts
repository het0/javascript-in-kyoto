import { TANK_SIZE } from "../domain/tank.js";
import { TileType, blocksTank } from "../domain/tile.js";
import type { Direction } from "../domain/direction.js";
import type { Position } from "../domain/position.js";
import type { Game } from "../domain/game.js";

const SPAWN_MIN_DISTANCE = 5; // min tile distance from any living tank
const SPAWN_MAX_ATTEMPTS = 100;
const DIRECTIONS: Direction[] = ["up", "down", "left", "right"];

export function trySpawn(game: Game): (Position & { direction: Direction }) | null {
  const { map } = game;

  for (let attempt = 0; attempt < SPAWN_MAX_ATTEMPTS; attempt++) {
    // pick random top-left corner of the 2×2 tank footprint
    const x = Math.floor(Math.random() * (map.width - TANK_SIZE));
    const y = Math.floor(Math.random() * (map.height - TANK_SIZE));

    if (!isAreaEmpty(map, x, y)) continue;
    if (isTooCloseToLivingTank(game, x, y)) continue;

    const direction = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
    return { x, y, direction };
  }

  return null;
}

function isAreaEmpty(
  map: import("../domain/map.js").GameMap,
  x: number,
  y: number,
): boolean {
  for (let dy = 0; dy < TANK_SIZE; dy++) {
    for (let dx = 0; dx < TANK_SIZE; dx++) {
      if (blocksTank(map.getTile(x + dx, y + dy) as TileType)) return false;
    }
  }
  return true;
}

function isTooCloseToLivingTank(game: Game, x: number, y: number): boolean {
  for (const tank of game.tanks.values()) {
    const dist = Math.abs(tank.position.x - x) + Math.abs(tank.position.y - y);
    if (dist < SPAWN_MIN_DISTANCE) return true;
  }
  return false;
}
