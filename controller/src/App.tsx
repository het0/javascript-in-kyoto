import { useCallback, useEffect, useRef, useState } from "react";
import { useController } from "./useController.js";

export function App() {
  const { connection, player, events, register, sendInput } = useController();
  const [name, setName] = useState("");

  // ─── Button state ────────────────────────────────────────────────────────────

  const held = useRef({ up: false, down: false, left: false, right: false, fire: false });

  const press = useCallback(
    (key: keyof typeof held.current, down: boolean) => {
      held.current[key] = down;
      sendInput({ ...held.current });
    },
    [sendInput],
  );

  // ─── Keyboard support ────────────────────────────────────────────────────────

  useEffect(() => {
    if (connection !== "registered") return;

    const keyMap: Record<string, keyof typeof held.current> = {
      ArrowUp: "up", KeyW: "up",
      ArrowDown: "down", KeyS: "down",
      ArrowLeft: "left", KeyA: "left",
      ArrowRight: "right", KeyD: "right",
      Space: "fire",
    };

    const onDown = (e: KeyboardEvent) => {
      const k = keyMap[e.code];
      if (k && !held.current[k]) { e.preventDefault(); press(k, true); }
    };
    const onUp = (e: KeyboardEvent) => {
      const k = keyMap[e.code];
      if (k) { e.preventDefault(); press(k, false); }
    };

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, [connection, press]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="app">
      <header className="header">
        <h1>🪖 Controller</h1>
        <span className={`badge badge--${connection}`}>
          {connection === "disconnected" && "Disconnected"}
          {connection === "connected" && "Connected — register to play"}
          {connection === "registered" && `Playing as ${player?.state === "dead" ? "💀 " : ""}${name}`}
        </span>
      </header>

      {connection !== "registered" ? (
        <RegisterForm
          name={name}
          setName={setName}
          disabled={connection === "disconnected"}
          onSubmit={() => register(name.trim())}
        />
      ) : (
        <>
          <HpBar hp={player?.hp ?? 0} state={player?.state ?? "alive"} respawnInMs={player?.respawnInMs} />
          <ScoreRow kills={player?.kills ?? 0} deaths={player?.deaths ?? 0} />
          <Controls press={press} disabled={player?.state === "dead"} />
        </>
      )}

      <EventLog events={events} />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RegisterForm({
  name, setName, disabled, onSubmit,
}: {
  name: string;
  setName: (v: string) => void;
  disabled: boolean;
  onSubmit: () => void;
}) {
  return (
    <form
      className="register-form"
      onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSubmit(); }}
    >
      <input
        className="name-input"
        type="text"
        placeholder="Enter your name"
        value={name}
        maxLength={20}
        disabled={disabled}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <button className="btn btn--primary" type="submit" disabled={disabled || !name.trim()}>
        Join Game
      </button>
    </form>
  );
}

function HpBar({ hp, state, respawnInMs }: { hp: number; state: string; respawnInMs?: number }) {
  return (
    <div className="hp-bar">
      <span className="hp-label">HP</span>
      <div className="hp-pips">
        {[1, 2, 3].map((i) => (
          <div key={i} className={`hp-pip ${i <= hp ? "hp-pip--full" : "hp-pip--empty"}`} />
        ))}
      </div>
      {state === "dead" && respawnInMs != null && (
        <RespawnCountdown ms={respawnInMs} />
      )}
    </div>
  );
}

function RespawnCountdown({ ms }: { ms: number }) {
  const [remaining, setRemaining] = useState(Math.ceil(ms / 1000));
  useEffect(() => {
    const end = Date.now() + ms;
    const t = setInterval(() => {
      const left = Math.ceil((end - Date.now()) / 1000);
      setRemaining(Math.max(0, left));
      if (left <= 0) clearInterval(t);
    }, 250);
    return () => clearInterval(t);
  }, [ms]);
  return <span className="respawn-timer">Respawning in {remaining}s…</span>;
}

function ScoreRow({ kills, deaths }: { kills: number; deaths: number }) {
  return (
    <div className="score-row">
      <div className="score-cell">
        <span className="score-value">{kills}</span>
        <span className="score-label">Kills</span>
      </div>
      <div className="score-cell">
        <span className="score-value">{deaths}</span>
        <span className="score-label">Deaths</span>
      </div>
      {deaths > 0 && (
        <div className="score-cell">
          <span className="score-value">{(kills / deaths).toFixed(1)}</span>
          <span className="score-label">K/D</span>
        </div>
      )}
    </div>
  );
}

type PressHandler = (key: "up" | "down" | "left" | "right" | "fire", down: boolean) => void;

function Controls({ press, disabled }: { press: PressHandler; disabled: boolean }) {
  return (
    <div className={`controls ${disabled ? "controls--disabled" : ""}`}>
      <div className="dpad">
        <div className="dpad-row dpad-row--top">
          <ControlButton label="↑" action="up" press={press} disabled={disabled} />
        </div>
        <div className="dpad-row dpad-row--middle">
          <ControlButton label="←" action="left" press={press} disabled={disabled} />
          <div className="dpad-center" />
          <ControlButton label="→" action="right" press={press} disabled={disabled} />
        </div>
        <div className="dpad-row dpad-row--bottom">
          <ControlButton label="↓" action="down" press={press} disabled={disabled} />
        </div>
      </div>

      <ControlButton label="🔥 FIRE" action="fire" press={press} disabled={disabled} className="fire-btn" />

      {!disabled && (
        <p className="keyboard-hint">or use W A S D + Space</p>
      )}
    </div>
  );
}

function ControlButton({
  label,
  action,
  press,
  disabled,
  className = "",
}: {
  label: string;
  action: "up" | "down" | "left" | "right" | "fire";
  press: PressHandler;
  disabled: boolean;
  className?: string;
}) {
  const handlers = {
    onMouseDown: () => press(action, true),
    onMouseUp: () => press(action, false),
    onMouseLeave: () => press(action, false),
    onTouchStart: (e: React.TouchEvent) => { e.preventDefault(); press(action, true); },
    onTouchEnd: (e: React.TouchEvent) => { e.preventDefault(); press(action, false); },
  };

  return (
    <button
      className={`btn btn--control ${className}`}
      disabled={disabled}
      {...handlers}
    >
      {label}
    </button>
  );
}

function EventLog({ events }: { events: import("./useController.js").GameEvent[] }) {
  if (events.length === 0) return null;
  return (
    <ul className="event-log">
      {events.map((ev) => (
        <li key={ev.id} className={`event event--${ev.kind}`}>
          {ev.text}
        </li>
      ))}
    </ul>
  );
}
