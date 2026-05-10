import { Router } from "express";
import type { Game } from "../../../domain/game.js";

export function healthRouter(game: Game): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({
      status: "ok",
      tick: game.tick,
      players: game.players.size,
    });
  });

  return router;
}
