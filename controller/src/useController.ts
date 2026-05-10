import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

const SERVER_URL = import.meta.env["VITE_SERVER_URL"] ?? "http://localhost:3000";

export type ConnectionState = "disconnected" | "connected" | "registered";

export type GameEvent = {
  id: number;
  text: string;
  kind: "info" | "hit" | "death" | "spawn";
};

export type PlayerInfo = {
  playerId: string;
  tankId: string;
  hp: number;
  kills: number;
  deaths: number;
  state: "alive" | "dead";
  respawnInMs?: number;
};

let eventId = 0;

export function useController() {
  const socketRef = useRef<Socket | null>(null);

  const [connection, setConnection] = useState<ConnectionState>("disconnected");
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);

  const pushEvent = useCallback((text: string, kind: GameEvent["kind"]) => {
    setEvents((prev) => [{ id: ++eventId, text, kind }, ...prev].slice(0, 20));
  }, []);

  useEffect(() => {
    const socket = io(`${SERVER_URL}/controller`);
    socketRef.current = socket;

    socket.on("connect", () => setConnection("connected"));
    socket.on("disconnect", () => {
      setConnection("disconnected");
      setPlayer(null);
    });

    socket.on("YOU_HIT", ({ hpRemaining, shotBy }: { hpRemaining: number; shotBy: string }) => {
      setPlayer((p) => p && { ...p, hp: hpRemaining });
      pushEvent(`Hit by ${shotBy} — ${hpRemaining} HP left`, "hit");
    });

    socket.on("YOU_DIED", ({ killedBy, respawnInMs }: { killedBy: string; respawnInMs: number }) => {
      setPlayer((p) =>
        p && { ...p, hp: 0, state: "dead", deaths: p.deaths + 1, respawnInMs },
      );
      pushEvent(`Killed by ${killedBy} — respawning in ${respawnInMs / 1000}s`, "death");
    });

    socket.on("YOU_SPAWNED", ({ tankId }: { tankId: string }) => {
      setPlayer((p) =>
        p && { ...p, tankId, hp: 3, state: "alive", respawnInMs: undefined },
      );
      pushEvent("Respawned — back in the fight!", "spawn");
    });

    return () => {
      socket.disconnect();
    };
  }, [pushEvent]);

  const register = useCallback((name: string) => {
    const socket = socketRef.current;
    if (!socket) return;

    socket.emit(
      "REGISTER_USER",
      { name },
      (ack: unknown) => {
        const res = ack as {
          ok: boolean;
          code?: string;
          playerId?: string;
          tankId?: string;
        };

        if (!res.ok) {
          pushEvent(`Registration failed: ${res.code}`, "info");
          return;
        }

        setPlayer({
          playerId: res.playerId!,
          tankId: res.tankId!,
          hp: 3,
          kills: 0,
          deaths: 0,
          state: "alive",
        });
        setConnection("registered");
        pushEvent("Registered — good luck!", "spawn");
      },
    );
  }, [pushEvent]);

  const sendInput = useCallback(
    (input: { up: boolean; down: boolean; left: boolean; right: boolean; fire: boolean }) => {
      socketRef.current?.emit("INPUT", input);
    },
    [],
  );

  return { connection, player, events, register, sendInput };
}
