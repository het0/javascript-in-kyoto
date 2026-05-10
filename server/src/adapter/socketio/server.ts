import { Server } from "socket.io";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Server as HttpServer } from "node:http";
import { registerRendererNamespace } from "./renderer-namespace.js";
import { registerControllerNamespace } from "./controller-namespace.js";
import { SocketIOBroadcaster } from "./broadcaster.js";
import type { Game } from "../../domain/game.js";
import type { GameLoop } from "../../usecase/game-loop.js";

export function setupSocketIO(
  httpServer: HttpServer<typeof IncomingMessage, typeof ServerResponse>,
  game: Game,
  loop: GameLoop,
): SocketIOBroadcaster {
  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  const rendererNsp = io.of("/renderer");
  const controllerNsp = io.of("/controller");

  const broadcaster = new SocketIOBroadcaster(rendererNsp, controllerNsp, () => game.players);

  registerRendererNamespace(rendererNsp, game);
  registerControllerNamespace(controllerNsp, loop);

  return broadcaster;
}
