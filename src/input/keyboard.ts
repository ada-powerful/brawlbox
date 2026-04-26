import type { Inputs } from '../engine/world.ts';
import { Btn } from '../engine/world.ts';

const held = new Set<string>();
let attached = false;

export function startKeyboard(target: Window | HTMLElement = window): void {
  if (attached) return;
  attached = true;
  target.addEventListener('keydown', (e) => {
    held.add((e as KeyboardEvent).code);
  });
  target.addEventListener('keyup', (e) => {
    held.delete((e as KeyboardEvent).code);
  });
}

export function pollInputs(): Inputs {
  const p1 =
    (held.has('KeyW') ? Btn.Up : 0) |
    (held.has('KeyS') ? Btn.Down : 0) |
    (held.has('KeyA') ? Btn.Left : 0) |
    (held.has('KeyD') ? Btn.Right : 0) |
    (held.has('KeyJ') ? Btn.A : 0) |
    (held.has('KeyK') ? Btn.B : 0) |
    (held.has('KeyL') ? Btn.C : 0);

  const p2 =
    (held.has('ArrowUp') ? Btn.Up : 0) |
    (held.has('ArrowDown') ? Btn.Down : 0) |
    (held.has('ArrowLeft') ? Btn.Left : 0) |
    (held.has('ArrowRight') ? Btn.Right : 0) |
    (held.has('Numpad1') ? Btn.A : 0) |
    (held.has('Numpad2') ? Btn.B : 0) |
    (held.has('Numpad3') ? Btn.C : 0);

  return { players: [{ buttons: p1 }, { buttons: p2 }] };
}
