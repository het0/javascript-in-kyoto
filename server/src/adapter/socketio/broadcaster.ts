import type { Namespace } from "socket.io";
import type {
  MapDto,
  PlayerHitPayload,
  PlayerJoinedPayload,
  PlayerKilledPayload,
  PlayerRespawnedPayload,
  StateSnapshot,
  YouDiedPayload,
  YouHitPayload,
  YouSpawnedPayload,
} from "@jik/shared";
import type { Player } from "../../domain/player.js";
import type { Broadcaster } from "../../usecase/ports.js";

export class SocketIOBroadcaster implements Broadcaster {
  constructor(
    private readonly rendererNsp: Namespace,
    private readonly controllerNsp: Namespace,
    private readonly getPlayers: () => Map<string, Player>,
  ) {}

  broadcastState(snap: StateSnapshot): void {
    this.rendererNsp.emit("STATE", snap);
  }

  broadcastMap(map: MapDto): void {
    this.rendererNsp.emit("MAP", map);
  }

  broadcastPlayerJoined(payload: PlayerJoinedPayload): void {
    this.rendererNsp.emit("PLAYER_JOINED", payload);
  }

  broadcastPlayerLeft(playerId: string): void {
    this.rendererNsp.emit("PLAYER_LEFT", { playerId });
  }

  broadcastPlayerHit(payload: PlayerHitPayload): void {
    this.rendererNsp.emit("PLAYER_HIT", payload);
  }

  broadcastPlayerKilled(payload: PlayerKilledPayload): void {
    this.rendererNsp.emit("PLAYER_KILLED", payload);
  }

  broadcastPlayerRespawned(payload: PlayerRespawnedPayload): void {
    this.rendererNsp.emit("PLAYER_RESPAWNED", payload);
  }

  emitToPlayer(
    player: Player,
    event: "YOU_HIT" | "YOU_DIED" | "YOU_SPAWNED",
    payload: YouHitPayload | YouDiedPayload | YouSpawnedPayload,
  ): void {
    this.controllerNsp.to(player.socketId).emit(event, payload);
  }
}
