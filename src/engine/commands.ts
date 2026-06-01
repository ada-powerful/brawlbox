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
  /** When set, the direction must be HELD for at least this many consecutive ticks (a charge). */
  charge?: number;
  /** When true, the direction is held — no release-edge gap is required before this step. */
  hold?: boolean;
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
  // Charge step: [dir]N — direction must be held for >= N consecutive ticks.
  const chargeMatch = /^\[([A-Z]+)\](\d+)$/.exec(s);
  if (chargeMatch) {
    const dirTok = chargeMatch[1]!;
    const n = Number.parseInt(chargeMatch[2]!, 10);
    if (!DIRECTION_SET.has(dirTok)) {
      throw new Error(`Unknown charge direction: "${dirTok}" in "${s}"`);
    }
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(`Charge hold must be a positive integer in "${s}"`);
    }
    return { dir: dirTok as Direction, buttons: [], charge: n };
  }

  // Held-direction step: prefixed with / — no release gap required.
  let hold = false;
  let work = s;
  if (work.startsWith('/')) {
    hold = true;
    work = work.slice(1);
  }

  // Strip leading ~ (negative-edge — deferred to phase 2)
  const stripped = work.replace(/^~/, '');

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

  return hold ? { dir, buttons, hold: true } : { dir, buttons };
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

/** Direction-only mask for a step (ignores buttons). Used for charge/held holds. */
function dirMask(step: MotionStep, facing: 1 | -1): number {
  return stepToMask({ dir: step.dir, buttons: [] }, facing);
}

function stepsEqual(a: MotionStep, b: MotionStep): boolean {
  if (a.dir !== b.dir) return false;
  if (a.buttons.length !== b.buttons.length) return false;
  const bs = new Set(b.buttons);
  return a.buttons.every((btn) => bs.has(btn));
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

  // `i` is the backward cursor into the buffer. The window only bounds the
  // *release* steps that come after a charge; a charge run itself may extend
  // arbitrarily far back (handled below), so we track the cursor explicitly
  // rather than relying solely on a loop bound.
  let i = lastBufIdx - 1;

  // When the step we're matching is identical to the one after it (e.g. the two
  // F's in a "F,F" dash), it must be a distinct press: require an intervening
  // frame where the mask is released, so HOLDING forward never reads as a
  // double-tap. Distinct steps (QCF's D→DF→F) need no such gap. Held steps
  // (`hold: true`) never require a release.
  const computeNeedRelease = (idx: number): boolean => {
    const cur = motion[idx];
    const next = motion[idx + 1];
    if (!cur || !next) return false;
    if (cur.hold) return false;
    return stepsEqual(cur, next);
  };

  let needRelease = computeNeedRelease(stepIdx);
  let sawRelease = false;

  // Global window floor for the current run of release steps, anchored to the
  // most recent frame consumed. Reset after a charge (the post-charge steps get
  // a fresh window relative to where the charge run began).
  let earliest = Math.max(0, lastBufIdx - windowTicks + 1);

  while (stepIdx >= 0) {
    const step = motion[stepIdx];
    if (!step) break;

    if (step.charge !== undefined) {
      // Find a run of >= charge consecutive held frames ending at or before `i`.
      // This is NOT bounded by windowTicks; it may extend to the start of buffer.
      const mask = dirMask(step, facing);
      let runEnd = i; // last (most recent) frame of the prospective run
      // Skip frames that aren't holding the charge direction to find the run's end.
      while (runEnd >= 0) {
        const b = buffer[runEnd];
        if (b !== undefined && (b & mask) === mask) break;
        runEnd--;
      }
      if (runEnd < 0) return false; // no held frame at all
      let count = 0;
      let j = runEnd;
      while (j >= 0) {
        const b = buffer[j];
        if (b === undefined || (b & mask) !== mask) break;
        count++;
        j--;
      }
      if (count < step.charge) return false;
      // Charge satisfied. Continue matching earlier steps before the run begins.
      stepIdx--;
      i = j; // frame just before the held run
      // Steps before the charge get a fresh window relative to the run start.
      earliest = Math.max(0, i + 1 - windowTicks);
      needRelease = computeNeedRelease(stepIdx);
      sawRelease = false;
      continue;
    }

    // Normal / held directional step: search backward within the window.
    const stepMask = stepToMask(step, facing);
    let matchedThisStep = false;
    for (; i >= earliest; i--) {
      const buf = buffer[i];
      if (buf === undefined) continue;
      const satisfied = (buf & stepMask) === stepMask;

      if (needRelease && !sawRelease) {
        if (!satisfied) sawRelease = true; // found the gap between the two taps
        continue;
      }

      if (satisfied) {
        matchedThisStep = true;
        i--; // consume this frame; earlier steps match before it
        break;
      }
    }

    if (!matchedThisStep) break;
    stepIdx--;
    needRelease = computeNeedRelease(stepIdx);
    sawRelease = false;
  }

  return stepIdx < 0;
}

export function recordInput(buffer: number[], input: number): void {
  buffer.push(input);
  if (buffer.length > INPUT_BUFFER_SIZE) {
    buffer.shift();
  }
}
