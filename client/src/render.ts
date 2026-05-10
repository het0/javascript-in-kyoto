import type { BulletDto, MapDto, TankDto } from "@jik/shared";
import type { Effect } from "./effects.js";

export const TILE_PX = 16;

const TILE_COLORS: Record<number, string> = {
  0: "#222", // empty
  1: "#a05a2c", // brick
  2: "#666", // steel
  3: "#3060c0", // water
  4: "#1a4a1a", // forest (v2)
  5: "#88ccdd", // ice (v2)
};

export function drawMap(ctx: CanvasRenderingContext2D, map: MapDto): void {
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = map.tiles[y][x];
      ctx.fillStyle = TILE_COLORS[tile] ?? "#f0f";
      ctx.fillRect(x * TILE_PX, y * TILE_PX, TILE_PX, TILE_PX);

      // Brick detail
      if (tile === 1) {
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.fillRect(x * TILE_PX, y * TILE_PX, TILE_PX, 1);
        ctx.fillRect(x * TILE_PX, y * TILE_PX, 1, TILE_PX);
      }
      // Steel highlight
      if (tile === 2) {
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.fillRect(x * TILE_PX, y * TILE_PX, TILE_PX, 2);
        ctx.fillRect(x * TILE_PX, y * TILE_PX, 2, TILE_PX);
      }
      // Water shimmer
      if (tile === 3) {
        ctx.fillStyle = "rgba(100,160,255,0.3)";
        ctx.fillRect(x * TILE_PX + 2, y * TILE_PX + 2, TILE_PX - 4, TILE_PX - 4);
      }
    }
  }
}

export function drawTanks(ctx: CanvasRenderingContext2D, tanks: TankDto[]): void {
  for (const tank of tanks) {
    const px = tank.x * TILE_PX;
    const py = tank.y * TILE_PX;
    const size = 2 * TILE_PX;

    ctx.fillStyle = tankBodyColor(tank.hp);
    ctx.fillRect(px, py, size, size);

    // Dark border
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);

    // Turret (direction indicator)
    drawTurret(ctx, px, py, size, tank.direction);

    // HP bar
    drawHpBar(ctx, px, py - 6, size, tank.hp);

    // Name label
    ctx.fillStyle = "white";
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    ctx.fillText(tank.name, px + size / 2, py - 8);
    ctx.textAlign = "left";
  }
}

function tankBodyColor(hp: number): string {
  if (hp >= 3) return "#4a9";
  if (hp === 2) return "#c80";
  return "#c44";
}

function drawTurret(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  direction: string,
): void {
  const hw = 4;
  const hl = 10;
  const cx = px + size / 2;
  const cy = py + size / 2;

  ctx.fillStyle = "#222";

  switch (direction) {
    case "up":
      ctx.fillRect(cx - hw / 2, py, hw, hl);
      break;
    case "down":
      ctx.fillRect(cx - hw / 2, py + size - hl, hw, hl);
      break;
    case "left":
      ctx.fillRect(px, cy - hw / 2, hl, hw);
      break;
    case "right":
      ctx.fillRect(px + size - hl, cy - hw / 2, hl, hw);
      break;
  }
}

function drawHpBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  hp: number,
): void {
  const segW = Math.floor((width - 4) / 3);
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i < hp ? "#4f4" : "#333";
    ctx.fillRect(x + 2 + i * (segW + 1), y, segW, 3);
  }
}

export function drawBullets(ctx: CanvasRenderingContext2D, bullets: BulletDto[]): void {
  ctx.fillStyle = "yellow";
  for (const b of bullets) {
    ctx.fillRect(b.x * TILE_PX - 2, b.y * TILE_PX - 2, 4, 4);
  }
}

export function drawEffects(ctx: CanvasRenderingContext2D, effects: Effect[]): void {
  for (const e of effects) e.draw(ctx);
}
