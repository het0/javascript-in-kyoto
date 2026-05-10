import type { Namespace } from "socket.io";
import type { Game } from "../../domain/game.js";

export function registerRendererNamespace(nsp: Namespace, game: Game): void {
  nsp.on("connection", (socket) => {
    // Send the map and current state immediately on connect
    socket.emit("MAP", game.mapDto());
    socket.emit("STATE", game.snapshot());
    // Renderers are purely receive-only — no event handlers registered here
  });
}
