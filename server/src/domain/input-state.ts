export type InputState = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  fire: boolean;
};

export const NEUTRAL: InputState = {
  up: false,
  down: false,
  left: false,
  right: false,
  fire: false,
};
