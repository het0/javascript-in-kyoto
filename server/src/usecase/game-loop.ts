import { disconnectPlayer } from "./disconnect.js";
import { registerPlayer, type RegisterRequest, type RegisterResult } from "./register-player.js";
import { processRespawn } from "./respawn.js";
import { applyInputToTank, advanceBullets } from "./tick.js";
import type { Game } from "../domain/game.js";
import type { InputState } from "../domain/input-state.js";
import type { Broadcaster } from "./ports.js";
import type { CollisionEvent } from "./collision.js";

const TICK_RATE = 30;
const TICK_MS = Math.round(1000 / TICK_RATE);
export const RESPAWN_DELAY_MS = 20_000;

export class GameLoop {
  private interval?: ReturnType<typeof setInterval>;
  private broadcaster: Broadcaster;

  constructor(
    private readonly game: Game,
    broadcaster: Broadcaster,
    private readonly now: () => number = Date.now,
  ) {
    this.broadcaster = broadcaster;
  }

  setBroadcaster(broadcaster: Broadcaster): void {
    this.broadcaster = broadcaster;
  }

  start(): void {
    this.interval = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
  }

  registerPlayer(req: RegisterRequest): RegisterResult {
    const result = registerPlayer(this.game, req);
    if (result.ok) {
      const player = this.game.players.get(result.playerId)!;
      this.broadcaster.broadcastPlayerJoined({
        playerId: player.id,
        name: player.name,
        skin: player.skin,
      });
    }
    return result;
  }

  removePlayer(socketId: string): void {
    const playerId = disconnectPlayer(this.game, socketId);
    if (playerId) {
      this.broadcaster.broadcastPlayerLeft(playerId);
    }
  }

  setInputState(playerId: string, state: InputState): void {
    const player = this.game.players.get(playerId);
    if (player) player.inputState = state;
  }

  rendererCount(): number {
    return 0; // Updated by adapter
  }

  getGame(): Game {
    return this.game;
  }

  private tick(): void {
    this.game.tick++;

    this.processRespawns();
    applyInputToTank(this.game);
    const events = advanceBullets(this.game);
    this.handleCollisionEvents(events);
    this.broadcaster.broadcastState(this.game.snapshot());
  }

  private processRespawns(): void {
    const now = this.now();
    for (const player of this.game.players.values()) {
      if (player.state !== "dead") continue;
      if ((player.respawnsAt ?? 0) > now) continue;

      const result = processRespawn(this.game, player, now);
      if (!result.respawned) {
        player.respawnsAt = result.retryAt;
        continue;
      }

      this.broadcaster.broadcastPlayerRespawned({
        playerId: player.id,
        tankId: result.tankId,
        position: result.position,
      });
      this.broadcaster.emitToPlayer(player, "YOU_SPAWNED", {
        tankId: result.tankId,
        position: result.position,
      });
    }
  }

  private handleCollisionEvents(events: CollisionEvent[]): void {
    for (const ev of events) {
      if (ev.type === "tank_hit") {
        const victim = this.game.players.get(ev.victimPlayerId)!;

        this.broadcaster.broadcastPlayerHit({
          victimPlayerId: ev.victimPlayerId,
          shooterPlayerId: ev.shooterPlayerId,
          victimHp: ev.victimHpAfter,
          position: ev.position,
        });
        this.broadcaster.emitToPlayer(victim, "YOU_HIT", {
          hpRemaining: ev.victimHpAfter,
          shotBy: this.game.players.get(ev.shooterPlayerId)?.name ?? "unknown",
        });
      } else if (ev.type === "tank_killed") {
        const victim = this.game.players.get(ev.victimPlayerId);
        const shooter = this.game.players.get(ev.shooterPlayerId);

        if (!victim) continue;

        const deathPosition = ev.position;

        victim.deaths += 1;
        victim.state = "dead";
        victim.respawnsAt = this.now() + RESPAWN_DELAY_MS;
        victim.tankId = undefined;
        this.game.tanks.delete(
          Array.from(this.game.tanks.values()).find((t) => t.playerId === victim.id)?.id ?? "",
        );

        if (shooter) shooter.kills += 1;

        this.broadcaster.broadcastPlayerKilled({
          victimPlayerId: victim.id,
          shooterPlayerId: ev.shooterPlayerId,
          victimDeaths: victim.deaths,
          shooterKills: shooter?.kills ?? 0,
          position: deathPosition,
        });
        this.broadcaster.emitToPlayer(victim, "YOU_DIED", {
          respawnInMs: RESPAWN_DELAY_MS,
          killedBy: shooter?.name ?? "unknown",
        });
      }
    }
  }
}
