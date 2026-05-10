import { TileType } from "./tile.js";

export class GameMap {
  readonly tiles: number[][];

  constructor(
    readonly width: number,
    readonly height: number,
    tiles: number[][],
  ) {
    this.tiles = tiles.map((row) => [...row]);
  }

  getTile(x: number, y: number): TileType {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return TileType.Steel;
    return this.tiles[y][x] as TileType;
  }

  setTile(x: number, y: number, tile: TileType): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.tiles[y][x] = tile;
  }

  static load(raw: unknown): GameMap {
    if (
      typeof raw !== "object" ||
      raw === null ||
      !("width" in raw) ||
      !("height" in raw) ||
      !("tiles" in raw)
    ) {
      throw new Error("Invalid map: missing width, height, or tiles");
    }
    const { width, height, tiles } = raw as { width: unknown; height: unknown; tiles: unknown };

    if (typeof width !== "number" || typeof height !== "number") {
      throw new Error("Invalid map: width and height must be numbers");
    }
    if (!Array.isArray(tiles)) throw new Error("Invalid map: tiles must be an array");
    if (tiles.length !== height) {
      throw new Error(`Invalid map: expected ${height} rows, got ${tiles.length}`);
    }

    for (let y = 0; y < tiles.length; y++) {
      const row = tiles[y];
      if (!Array.isArray(row)) throw new Error(`Invalid map: row ${y} is not an array`);
      if (row.length !== width) {
        throw new Error(`Invalid map: row ${y} has ${row.length} tiles, expected ${width}`);
      }
      for (let x = 0; x < row.length; x++) {
        const v = row[x];
        if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 5) {
          throw new Error(
            `Invalid map: tile [${y}][${x}] = ${v} is not a valid tile (0–5). Key 6 (Base) is removed.`,
          );
        }
      }
    }

    return new GameMap(width, height, tiles as number[][]);
  }
}
