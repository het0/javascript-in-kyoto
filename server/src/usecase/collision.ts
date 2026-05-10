import { BULLET_SIZE, type Bullet } from "../domain/bullet.js";
import { TANK_SIZE, type Tank } from "../domain/tank.js";
import type { Position } from "../domain/position.js";

export type TankHitEvent = {
  type: "tank_hit";
  victimPlayerId: string;
  shooterPlayerId: string;
  victimHpAfter: number;
  position: Position;
};

export type TankKilledEvent = {
  type: "tank_killed";
  victimPlayerId: string;
  shooterPlayerId: string;
  position: Position;
};

export type CollisionEvent = TankHitEvent | TankKilledEvent;

export function checkBulletVsTank(
  bullet: Bullet,
  tank: Tank,
): TankHitEvent | TankKilledEvent | null {
  if (bullet.ownerPlayerId === tank.playerId) return null; // friendly-fire immunity

  if (!aabbOverlap(bullet.position, BULLET_SIZE, tank.position, TANK_SIZE)) return null;

  tank.hp -= 1;

  if (tank.hp > 0) {
    return {
      type: "tank_hit",
      victimPlayerId: tank.playerId,
      shooterPlayerId: bullet.ownerPlayerId,
      victimHpAfter: tank.hp,
      position: { x: tank.position.x, y: tank.position.y },
    };
  }

  return {
    type: "tank_killed",
    victimPlayerId: tank.playerId,
    shooterPlayerId: bullet.ownerPlayerId,
    position: { x: tank.position.x, y: tank.position.y },
  };
}

function aabbOverlap(
  posA: Position,
  sizeA: number,
  posB: Position,
  sizeB: number,
): boolean {
  return (
    posA.x < posB.x + sizeB &&
    posA.x + sizeA > posB.x &&
    posA.y < posB.y + sizeB &&
    posA.y + sizeA > posB.y
  );
}
