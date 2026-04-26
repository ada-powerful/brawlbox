import { describe, expect, test } from 'vitest';
import { tick } from '../src/engine/tick.ts';
import { Btn, createWorld, STAGE_LEFT_X, STAGE_RIGHT_X } from '../src/engine/world.ts';
import type { Inputs } from '../src/engine/world.ts';

const noInput: Inputs = { players: [{ buttons: 0 }, { buttons: 0 }] };
const p1Right: Inputs = { players: [{ buttons: Btn.Right }, { buttons: 0 }] };
const p1Left: Inputs = { players: [{ buttons: Btn.Left }, { buttons: 0 }] };

describe('tick', () => {
  test('increments tick counter', () => {
    const w = createWorld();
    expect(w.tick).toBe(0);
    tick(w, noInput);
    expect(w.tick).toBe(1);
    tick(w, noInput);
    expect(w.tick).toBe(2);
  });

  test('right input moves player 1 right', () => {
    const w = createWorld();
    const x0 = w.players[0]!.pos.x;
    tick(w, p1Right);
    expect(w.players[0]!.pos.x).toBeGreaterThan(x0);
  });

  test('left input moves player 1 left', () => {
    const w = createWorld();
    const x0 = w.players[0]!.pos.x;
    tick(w, p1Left);
    expect(w.players[0]!.pos.x).toBeLessThan(x0);
  });

  test('player 2 unaffected by player 1 input', () => {
    const w = createWorld();
    const x0 = w.players[1]!.pos.x;
    tick(w, p1Right);
    expect(w.players[1]!.pos.x).toBe(x0);
  });

  test('clamps to left stage bound', () => {
    const w = createWorld();
    w.players[0]!.pos.x = STAGE_LEFT_X + 5;
    for (let i = 0; i < 100; i++) tick(w, p1Left);
    expect(w.players[0]!.pos.x).toBe(STAGE_LEFT_X);
  });

  test('clamps to right stage bound', () => {
    const w = createWorld();
    w.players[0]!.pos.x = STAGE_RIGHT_X - 5;
    for (let i = 0; i < 100; i++) tick(w, p1Right);
    expect(w.players[0]!.pos.x).toBe(STAGE_RIGHT_X);
  });

  test('opposing left+right cancel out', () => {
    const w = createWorld();
    const x0 = w.players[0]!.pos.x;
    tick(w, { players: [{ buttons: Btn.Left | Btn.Right }, { buttons: 0 }] });
    expect(w.players[0]!.pos.x).toBe(x0);
  });

  test('determinism — same world + same inputs produce identical results across runs', () => {
    const seq: Inputs[] = [
      p1Right,
      p1Right,
      noInput,
      { players: [{ buttons: 0 }, { buttons: Btn.Left }] },
      p1Left,
    ];
    const a = createWorld();
    const b = createWorld();
    for (const inp of seq) {
      tick(a, inp);
      tick(b, inp);
    }
    expect(a).toEqual(b);
  });
});
