import type { Inputs } from '../engine/world.ts';
import { Btn } from '../engine/world.ts';
import { pollGamepad } from './gamepad.ts';

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

function p1Keyboard(): number {
  return (
    (held.has('KeyW') ? Btn.Up : 0) |
    (held.has('KeyS') ? Btn.Down : 0) |
    (held.has('KeyA') ? Btn.Left : 0) |
    (held.has('KeyD') ? Btn.Right : 0) |
    (held.has('KeyJ') ? Btn.A : 0) |
    (held.has('KeyK') ? Btn.B : 0) |
    (held.has('KeyL') ? Btn.C : 0) |
    (held.has('KeyU') ? Btn.X : 0) |
    (held.has('KeyI') ? Btn.Y : 0) |
    (held.has('KeyO') ? Btn.Z : 0)
  );
}

function p2Keyboard(): number {
  return (
    (held.has('ArrowUp') ? Btn.Up : 0) |
    (held.has('ArrowDown') ? Btn.Down : 0) |
    (held.has('ArrowLeft') ? Btn.Left : 0) |
    (held.has('ArrowRight') ? Btn.Right : 0) |
    (held.has('Numpad1') ? Btn.A : 0) |
    (held.has('Numpad2') ? Btn.B : 0) |
    (held.has('Numpad3') ? Btn.C : 0) |
    (held.has('Numpad4') ? Btn.X : 0) |
    (held.has('Numpad5') ? Btn.Y : 0) |
    (held.has('Numpad6') ? Btn.Z : 0)
  );
}

export function pollInputs(): Inputs {
  const p1 = p1Keyboard() | pollGamepad(0);
  const p2 = p2Keyboard() | pollGamepad(1);
  return { players: [{ buttons: p1 }, { buttons: p2 }] };
}
