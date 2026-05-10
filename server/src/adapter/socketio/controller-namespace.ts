import type { Namespace } from "socket.io";
import { InputSchema, RegisterUserSchema } from "./schemas.js";
import type { GameLoop } from "../../usecase/game-loop.js";

export function registerControllerNamespace(nsp: Namespace, loop: GameLoop): void {
  nsp.on("connection", (socket) => {
    socket.on("REGISTER_USER", (raw: unknown, ack?: (res: unknown) => void) => {
      const parsed = RegisterUserSchema.safeParse(raw);
      if (!parsed.success) {
        ack?.({ ok: false, code: "invalid_payload", message: "Invalid payload" });
        return;
      }

      const result = loop.registerPlayer({
        socketId: socket.id,
        name: parsed.data.name,
        skin: parsed.data.skin,
      });

      if (!result.ok) {
        const messages: Record<string, string> = {
          duplicate_name: "That name is already taken",
          no_spawn: "No spawn point available — try again",
          already_registered: "This socket is already registered",
        };
        ack?.({ ok: false, code: result.code, message: messages[result.code] ?? "Error" });
        return;
      }

      socket.data.playerId = result.playerId;
      ack?.({
        ok: true,
        playerId: result.playerId,
        tankId: result.tankId,
        spawnPosition: result.spawnPosition,
      });
    });

    socket.on("INPUT", (raw: unknown) => {
      if (!socket.data.playerId) return; // not registered yet
      const parsed = InputSchema.safeParse(raw);
      if (!parsed.success) return;
      loop.setInputState(socket.data.playerId as string, parsed.data);
    });

    socket.on("disconnect", () => {
      loop.removePlayer(socket.id);
    });
  });
}
