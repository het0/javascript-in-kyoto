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
import type { Player } from "../domain/player.js";

export interface Broadcaster {
  broadcastState(snap: StateSnapshot): void;
  broadcastMap(map: MapDto): void;
  broadcastPlayerJoined(payload: PlayerJoinedPayload): void;
  broadcastPlayerLeft(playerId: string): void;
  broadcastPlayerHit(payload: PlayerHitPayload): void;
  broadcastPlayerKilled(payload: PlayerKilledPayload): void;
  broadcastPlayerRespawned(payload: PlayerRespawnedPayload): void;
  emitToPlayer(player: Player, event: "YOU_HIT", payload: YouHitPayload): void;
  emitToPlayer(player: Player, event: "YOU_DIED", payload: YouDiedPayload): void;
  emitToPlayer(player: Player, event: "YOU_SPAWNED", payload: YouSpawnedPayload): void;
}
