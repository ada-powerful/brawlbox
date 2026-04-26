import { Btn } from './world.ts';

const DIRECTIONS = ['F', 'B', 'U', 'D', 'UF', 'UB', 'DF', 'DB', 'N'] as const;
type Direction = (typeof DIRECTIONS)[number];
const DIRECTION_SET = new Set<string>(DIRECTIONS);

const BUTTONS = ['a', 'b', 'c', 'x', 'y', 'z'] as const;
type Button = (typeof BUTTONS)[number];
const BUTTON_SET = new Set<string>(BUTTONS);

export interface MotionStep {
  dir: Direction | null;
  buttons: Button[];
}

export type ParsedMotion = MotionStep[];

export const INPUT_BUFFER_SIZE = 60;

export function parseMotion(s: string): ParsedMotion {
  const steps = s
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (steps.length === 0) {
    throw new Error(`Empty motion: "${s}"`);
  }
  return steps.map((step) => parseStep(step));
}

function parseStep(s: string): MotionStep {
  // Strip leading ~ (negative-edge — deferred to phase 2)
  const stripped = s.replace(/^~/, '');

  const parts = stripped
    .split('+')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) {
    throw new Error(`Empty motion step in "${s}"`);
  }

  let dir: Direction | null = null;
  const buttons: Button[] = [];

  for (const part of parts) {
    if (DIRECTION_SET.has(part)) {
      if (dir !== null) {
        throw new Error(`Multiple directions in step: "${s}"`);
      }
      dir = part as Direction;
    } else if (BUTTON_SET.has(part)) {
      buttons.push(part as Button);
    } else {
      throw new Error(`Unknown motion token: "${part}" in "${s}"`);
    }
  }

  return { dir, buttons };
}

export function stepToMask(step: MotionStep, facing: 1 | -1): number {
  let mask = 0;
  if (step.dir) {
    if (step.dir.includes('U')) mask |= Btn.Up;
    if (step.dir.includes('D')) mask |= Btn.Down;
    if (step.dir.includes('F')) mask |= facing === 1 ? Btn.Right : Btn.Left;
    if (step.dir.includes('B')) mask |= facing === 1 ? Btn.Left : Btn.Right;
  }
  for (const b of step.buttons) {
    switch (b) {
      case 'a':
        mask |= Btn.A;
        break;
      case 'b':
        mask |= Btn.B;
        break;
      case 'c':
        mask |= Btn.C;
        break;
      case 'x':
        mask |= Btn.X;
        break;
      case 'y':
        mask |= Btn.Y;
        break;
      case 'z':
        mask |= Btn.Z;
        break;
    }
  }
  return mask;
}

export function matchMotion(
  motion: ParsedMotion,
  buffer: number[],
  facing: 1 | -1,
  windowTicks: number,
): boolean {
  if (motion.length === 0) return false;
  if (buffer.length === 0) return false;

  const lastBufIdx = buffer.length - 1;
  const lastInput = buffer[lastBufIdx];
  if (lastInput === undefined) return false;

  const lastStep = motion[motion.length - 1];
  if (!lastStep) return false;
  const lastStepMask = stepToMask(lastStep, facing);
  if ((lastInput & lastStepMask) !== lastStepMask) return false;

  if (motion.length === 1) return true;

  let stepIdx = motion.length - 2;
  const earliest = Math.max(0, lastBufIdx - windowTicks + 1);

  for (let i = lastBufIdx - 1; i >= earliest && stepIdx >= 0; i--) {
    const step = motion[stepIdx];
    if (!step) break;
    const buf = buffer[i];
    if (buf === undefined) continue;
    const stepMask = stepToMask(step, facing);
    if ((buf & stepMask) === stepMask) {
      stepIdx--;
    }
  }

  return stepIdx < 0;
}

export function recordInput(buffer: number[], input: number): void {
  buffer.push(input);
  if (buffer.length > INPUT_BUFFER_SIZE) {
    buffer.shift();
  }
}
