import type { Direction } from "./direction.js";
import type { Position } from "./position.js";

export const BULLET_SIZE = 0.5; // bullet footprint in tiles

export class Bullet {
  constructor(
    readonly id: string,
    readonly ownerPlayerId: string,
    readonly ownerTankId: string,
    public position: Position,
    public direction: Direction,
  ) {}
}
