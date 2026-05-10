import { NEUTRAL, type InputState } from "./input-state.js";

export type PlayerState = "alive" | "dead";

export class Player {
  kills: number = 0;
  deaths: number = 0;
  state: PlayerState = "alive";
  respawnsAt?: number; // epoch ms
  inputState: InputState = { ...NEUTRAL };
  tankId?: string; // present iff alive

  constructor(
    readonly id: string,
    readonly socketId: string,
    public name: string,
    public skin?: string,
  ) {}
}
