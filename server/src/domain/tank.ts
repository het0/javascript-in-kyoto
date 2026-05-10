import type { Direction } from "./direction.js";
import type { Position } from "./position.js";

export const MAX_HP = 3;
export const TANK_SIZE = 2; // occupies 2×2 tiles

export class Tank {
  hp: number = MAX_HP;
  isMoving: boolean = false;
  bulletId?: string;

  constructor(
    readonly id: string,
    readonly playerId: string,
    public position: Position,
    public direction: Direction,
  ) {}
}
