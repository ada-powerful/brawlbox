import type { Inputs, World } from '../engine/world.ts';

const TICK_MS = 1000 / 60;
const MAX_TICKS_PER_FRAME = 4;

export interface LoopOptions {
  initialWorld: World;
  pollInputs: () => Inputs;
  tick: (world: World, inputs: Inputs) => World;
  render: (prev: World, curr: World, alpha: number) => void;
}

export function startLoop(opts: LoopOptions): () => void {
  let curr = opts.initialWorld;
  let prev = structuredClone(curr);
  let accumulator = 0;
  let lastTime = performance.now();
  let stopped = false;
  let rafHandle = 0;

  const frame = (now: number) => {
    if (stopped) return;
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

  return () => {
    stopped = true;
    cancelAnimationFrame(rafHandle);
  };
}
