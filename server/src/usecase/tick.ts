import { DIRECTION_DELTA } from "../domain/direction.js";
import { TileType, blocksBullet, blocksTank } from "../domain/tile.js";
import { TANK_SIZE } from "../domain/tank.js";
import { Bullet, BULLET_SIZE } from "../domain/bullet.js";
import { nanoid } from "nanoid";
import type { Game } from "../domain/game.js";
import type { CollisionEvent } from "./collision.js";
import { checkBulletVsTank } from "./collision.js";

const TANK_SPEED = 0.1; // tiles per tick
const BULLET_SPEED = 0.3; // tiles per tick

export function applyInputToTank(game: Game): void {
  for (const player of game.players.values()) {
    if (player.state !== "alive" || !player.tankId) continue;
    const tank = game.tanks.get(player.tankId);
    if (!tank) continue;

    const { up, down, left, right, fire } = player.inputState;

    // Determine direction from input (priority: up > down > left > right)
    let newDirection = tank.direction;
    let moving = false;

    if (up) {
      newDirection = "up";
      moving = true;
    } else if (down) {
      newDirection = "down";
      moving = true;
    } else if (left) {
      newDirection = "left";
      moving = true;
    } else if (right) {
      newDirection = "right";
      moving = true;
    }

    tank.direction = newDirection;
    tank.isMoving = moving;

    if (moving) {
      const delta = DIRECTION_DELTA[newDirection];
      const nx = tank.position.x + delta.dx * TANK_SPEED;
      const ny = tank.position.y + delta.dy * TANK_SPEED;

      if (canTankMoveTo(game, nx, ny, tank.id)) {
        tank.position = { x: nx, y: ny };
      }
    }

    // Fire
    if (fire && !tank.bulletId) {
      const bullet = fireBullet(game, player.id, tank.id);
      tank.bulletId = bullet.id;
      game.bullets.set(bullet.id, bullet);
    }
  }
}

function canTankMoveTo(game: Game, x: number, y: number, tankId: string): boolean {
  const { map } = game;

  // Check all 4 corners of the 2×2 tank footprint
  const corners = [
    { cx: x, cy: y },
    { cx: x + TANK_SIZE - 0.01, cy: y },
    { cx: x, cy: y + TANK_SIZE - 0.01 },
    { cx: x + TANK_SIZE - 0.01, cy: y + TANK_SIZE - 0.01 },
  ];

  for (const { cx, cy } of corners) {
    const tx = Math.floor(cx);
    const ty = Math.floor(cy);
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return false;
    if (blocksTank(map.getTile(tx, ty) as TileType)) return false;
  }

  return true;
}

function fireBullet(game: Game, playerId: string, tankId: string): Bullet {
  const tank = game.tanks.get(tankId)!;
  const delta = DIRECTION_DELTA[tank.direction];

  // Spawn bullet at the tank's center, offset in firing direction
  const bulletX = tank.position.x + TANK_SIZE / 2 - BULLET_SIZE / 2 + delta.dx * TANK_SIZE;
  const bulletY = tank.position.y + TANK_SIZE / 2 - BULLET_SIZE / 2 + delta.dy * TANK_SIZE;

  return new Bullet(nanoid(), playerId, tankId, { x: bulletX, y: bulletY }, tank.direction);
}

export function advanceBullets(game: Game): CollisionEvent[] {
  const events: CollisionEvent[] = [];
  const toRemove: string[] = [];

  for (const bullet of game.bullets.values()) {
    const delta = DIRECTION_DELTA[bullet.direction];
    bullet.position = {
      x: bullet.position.x + delta.dx * BULLET_SPEED,
      y: bullet.position.y + delta.dy * BULLET_SPEED,
    };

    const { x, y } = bullet.position;

    // Out of bounds
    if (x < 0 || y < 0 || x >= game.map.width || y >= game.map.height) {
      toRemove.push(bullet.id);
      continue;
    }

    // Check tile collision
    const tx = Math.floor(x + BULLET_SIZE / 2);
    const ty = Math.floor(y + BULLET_SIZE / 2);
    const tile = game.map.getTile(tx, ty) as TileType;

    if (blocksBullet(tile)) {
      if (tile === TileType.Brick) {
        game.map.setTile(tx, ty, TileType.Empty);
        game.addMapDiff({ x: tx, y: ty, tile: TileType.Empty });
      }
      toRemove.push(bullet.id);
      continue;
    }

    // Check tank collisions
    let hit = false;
    for (const tank of game.tanks.values()) {
      const ev = checkBulletVsTank(bullet, tank);
      if (ev) {
        events.push(ev);
        toRemove.push(bullet.id);
        // Clear owner's bullet reference
        const ownerTank = game.tanks.get(bullet.ownerTankId);
        if (ownerTank) ownerTank.bulletId = undefined;
        hit = true;
        break;
      }
    }
    if (hit) continue;
  }

  for (const id of toRemove) {
    const b = game.bullets.get(id);
    if (b) {
      game.bullets.delete(id);
      // Also clear from owner tank if not already cleared
      const ownerTank = game.tanks.get(b.ownerTankId);
      if (ownerTank && ownerTank.bulletId === id) ownerTank.bulletId = undefined;
    }
  }

  return events;
}
