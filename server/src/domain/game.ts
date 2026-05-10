import type { Bullet } from "./bullet.js";
import type { GameMap } from "./map.js";
import type { Player } from "./player.js";
import type { Tank } from "./tank.js";
import type { MapDiffEntry, StateSnapshot } from "@jik/shared";

export class Game {
  readonly players = new Map<string, Player>(); // playerId → Player
  readonly tanks = new Map<string, Tank>(); // tankId → Tank
  readonly bullets = new Map<string, Bullet>();
  tick: number = 0;
  private mapDiff: MapDiffEntry[] = [];

  constructor(readonly map: GameMap) {}

  addMapDiff(entry: MapDiffEntry): void {
    this.mapDiff.push(entry);
  }

  snapshot(): StateSnapshot {
    const diff = this.mapDiff.splice(0);
    return {
      tick: this.tick,
      tanks: Array.from(this.tanks.values()).map((t) => {
        const player = this.players.get(t.playerId)!;
        return {
          id: t.id,
          playerId: t.playerId,
          name: player.name,
          skin: player.skin,
          x: t.position.x,
          y: t.position.y,
          direction: t.direction,
          isMoving: t.isMoving,
          hp: t.hp,
          bulletId: t.bulletId,
        };
      }),
      bullets: Array.from(this.bullets.values()).map((b) => ({
        id: b.id,
        ownerPlayerId: b.ownerPlayerId,
        ownerTankId: b.ownerTankId,
        x: b.position.x,
        y: b.position.y,
        direction: b.direction,
      })),
      scoreboard: Array.from(this.players.values())
        .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
        .map((p) => ({
          playerId: p.id,
          name: p.name,
          skin: p.skin,
          kills: p.kills,
          deaths: p.deaths,
          state: p.state,
        })),
      mapDiff: diff,
    };
  }

  mapDto() {
    return {
      width: this.map.width,
      height: this.map.height,
      tiles: this.map.tiles,
    };
  }

  findPlayerBySocketId(socketId: string): Player | undefined {
    for (const p of this.players.values()) {
      if (p.socketId === socketId) return p;
    }
    return undefined;
  }
}
