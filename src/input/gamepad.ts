import { Btn } from '../engine/world.ts';

const AXIS_THRESHOLD = 0.5;

export function pollGamepad(index: number): number {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return 0;
  const pads = navigator.getGamepads();
  const pad = pads[index];
  if (!pad) return 0;

  let mask = 0;

  if (pad.buttons[12]?.pressed) mask |= Btn.Up;
  if (pad.buttons[13]?.pressed) mask |= Btn.Down;
  if (pad.buttons[14]?.pressed) mask |= Btn.Left;
  if (pad.buttons[15]?.pressed) mask |= Btn.Right;

  const ay = pad.axes[1] ?? 0;
  const ax = pad.axes[0] ?? 0;
  if (ay < -AXIS_THRESHOLD) mask |= Btn.Up;
  if (ay > AXIS_THRESHOLD) mask |= Btn.Down;
  if (ax < -AXIS_THRESHOLD) mask |= Btn.Left;
  if (ax > AXIS_THRESHOLD) mask |= Btn.Right;

  if (pad.buttons[2]?.pressed) mask |= Btn.A;
  if (pad.buttons[3]?.pressed) mask |= Btn.B;
  if (pad.buttons[5]?.pressed) mask |= Btn.C;
  if (pad.buttons[0]?.pressed) mask |= Btn.X;
  if (pad.buttons[1]?.pressed) mask |= Btn.Y;
  if (pad.buttons[7]?.pressed) mask |= Btn.Z;

  return mask;
}
