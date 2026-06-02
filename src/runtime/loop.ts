import type { Inputs, World } from '../engine/world.ts';

const TICK_MS = 1000 / 60;
const MAX_TICKS_PER_FRAME = 4;

/** True when the document has OS-level focus (false → user clicked another app/tab). */
function documentHasFocus(): boolean {
  return typeof document === 'undefined' || document.hasFocus();
}

export interface LoopOptions {
  createWorld: () => World;
  pollInputs: () => Inputs;
  tick: (world: World, inputs: Inputs) => World;
  render: (prev: World, curr: World, alpha: number) => void;
}

export interface LoopHandle {
  stop: () => void;
  reset: () => void;
  pause: () => void;
  resume: () => void;
}

export function startLoop(opts: LoopOptions): LoopHandle {
  let curr = opts.createWorld();
  let prev = structuredClone(curr);
  let accumulator = 0;
  let lastTime = performance.now();
  let stopped = false;
  let paused = false;
  let rafHandle = 0;

  const frame = (now: number) => {
    if (stopped) return;
    // Freeze the match while paused (manual) OR while the window doesn't have
    // focus. hasFocus() is polled every frame, so unlike a one-shot blur event
    // it can't be missed if focus is lost between frames. Keep the rAF alive
    // and re-anchor lastTime so the idle gap isn't dumped into the accumulator
    // as one giant dt when we resume.
    if (paused || !documentHasFocus()) {
      lastTime = now;
      rafHandle = requestAnimationFrame(frame);
      return;
    }
    const dt = Math.min(now - lastTime, 250);
    lastTime = now;
    accumulator += dt;

    let ticks = 0;
    while (accumulator >= TICK_MS && ticks < MAX_TICKS_PER_FRAME) {
      prev = structuredClone(curr);
      curr = opts.tick(curr, opts.pollInputs());
      accumulator -= TICK_MS;
      ticks++;
    }
    if (accumulator >= TICK_MS) accumulator = 0;

    const alpha = accumulator / TICK_MS;
    opts.render(prev, curr, alpha);
    rafHandle = requestAnimationFrame(frame);
  };
  rafHandle = requestAnimationFrame(frame);

  const pause = (): void => {
    paused = true;
  };
  const resume = (): void => {
    paused = false;
  };

  return {
    stop: () => {
      stopped = true;
      cancelAnimationFrame(rafHandle);
    },
    reset: () => {
      curr = opts.createWorld();
      prev = structuredClone(curr);
      accumulator = 0;
      lastTime = performance.now();
    },
    pause,
    resume,
  };
}
