export enum TileType {
  Empty = 0,
  Brick = 1,
  Steel = 2,
  Water = 3,
  Forest = 4, // v2
  Ice = 5, // v2
  // 6 (Base) intentionally omitted — deathmatch only
}

export function blocksTank(tile: TileType): boolean {
  return tile === TileType.Brick || tile === TileType.Steel || tile === TileType.Water;
}

export function blocksBullet(tile: TileType): boolean {
  return tile === TileType.Brick || tile === TileType.Steel;
}

export function isDestructible(tile: TileType): boolean {
  return tile === TileType.Brick;
}
