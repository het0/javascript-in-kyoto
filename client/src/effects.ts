const TILE_PX = 16;

export type Effect = {
  advance(dt: number): boolean;
  draw(ctx: CanvasRenderingContext2D): void;
};

export function makeHitFlash(pos: { x: number; y: number }): Effect {
  let life = 150;
  return {
    advance(dt) {
      life -= dt;
      return life > 0;
    },
    draw(ctx) {
      const alpha = Math.max(0, life / 150);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fillRect(pos.x * TILE_PX, pos.y * TILE_PX, 2 * TILE_PX, 2 * TILE_PX);
    },
  };
}

export function makeExplosion(pos: { x: number; y: number }): Effect {
  let life = 600;
  return {
    advance(dt) {
      life -= dt;
      return life > 0;
    },
    draw(ctx) {
      const t = 1 - life / 600;
      const radius = TILE_PX * (1 + 2 * t);
      const alpha = 1 - t;
      ctx.strokeStyle = `rgba(255, 100, 0, ${alpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc((pos.x + 1) * TILE_PX, (pos.y + 1) * TILE_PX, radius, 0, Math.PI * 2);
      ctx.stroke();

      // Inner flash
      const innerAlpha = Math.max(0, (0.3 - t) * 3);
      if (innerAlpha > 0) {
        ctx.fillStyle = `rgba(255, 200, 50, ${innerAlpha})`;
        ctx.beginPath();
        ctx.arc((pos.x + 1) * TILE_PX, (pos.y + 1) * TILE_PX, radius * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  };
}

export function makeSpawnPulse(pos: { x: number; y: number }): Effect {
  let life = 800;
  return {
    advance(dt) {
      life -= dt;
      return life > 0;
    },
    draw(ctx) {
      const t = 1 - life / 800;
      const alpha = (1 - t) * 0.7;
      ctx.strokeStyle = `rgba(0, 200, 255, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc((pos.x + 1) * TILE_PX, (pos.y + 1) * TILE_PX, TILE_PX * (1 + t), 0, Math.PI * 2);
      ctx.stroke();
    },
  };
}
