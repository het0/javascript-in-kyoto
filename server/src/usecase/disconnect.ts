import type { Game } from "../domain/game.js";

export function disconnectPlayer(game: Game, socketId: string): string | null {
  const player = game.findPlayerBySocketId(socketId);
  if (!player) return null;

  if (player.tankId) {
    const tank = game.tanks.get(player.tankId);
    if (tank?.bulletId) {
      game.bullets.delete(tank.bulletId);
    }
    game.tanks.delete(player.tankId);
  }

  game.players.delete(player.id);
  return player.id;
}
