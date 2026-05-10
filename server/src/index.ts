import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pino from "pino";
import { Game } from "./domain/game.js";
import { GameMap } from "./domain/map.js";
import { GameLoop } from "./usecase/game-loop.js";
import { createApp } from "./adapter/http/app.js";
import { setupSocketIO } from "./adapter/socketio/server.js";
import { env } from "./config/env.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const logger = pino({ level: env.LOG_LEVEL });

// 1. Load and validate map
const mapPath = join(__dirname, "..", "map.json");
const mapRaw = JSON.parse(readFileSync(mapPath, "utf8"));
const gameMap = GameMap.load(mapRaw);
logger.info({ width: gameMap.width, height: gameMap.height }, "Map loaded");

// 2. Create game and a no-op broadcaster placeholder
const game = new Game(gameMap);
const noop = () => {};
const noopBroadcaster = {
  broadcastState: noop,
  broadcastMap: noop,
  broadcastPlayerJoined: noop,
  broadcastPlayerLeft: noop,
  broadcastPlayerHit: noop,
  broadcastPlayerKilled: noop,
  broadcastPlayerRespawned: noop,
  emitToPlayer: noop,
};

// 3. Create loop with placeholder broadcaster (replaced below)
const loop = new GameLoop(game, noopBroadcaster);

// 4. Create HTTP server + Socket.IO — wires real broadcaster + namespace handlers
const app = createApp(game);
const httpServer = createServer(app);
const broadcaster = setupSocketIO(httpServer, game, loop);

// 5. Replace placeholder with real broadcaster
loop.setBroadcaster(broadcaster);

// 6. Start
httpServer.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "Server listening");
  loop.start();
  logger.info("Game loop started at 30 Hz");
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down");
  loop.stop();
  httpServer.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down");
  loop.stop();
  httpServer.close(() => process.exit(0));
});
