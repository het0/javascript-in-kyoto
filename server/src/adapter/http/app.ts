import express, { type Express } from "express";
import { healthRouter } from "./routes/health.js";
import type { Game } from "../../domain/game.js";

export function createApp(game: Game): Express {
  const app = express();
  app.use(express.json());
  app.use("/healthz", healthRouter(game));
  return app;
}
