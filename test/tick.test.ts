import { describe, expect, test } from 'vitest';
import { tick } from '../src/engine/tick.ts';
import { parseCharacter } from '../src/engine/schema.ts';
import { Btn, createWorld, STAGE_LEFT_X, STAGE_RIGHT_X } from '../src/engine/world.ts';
import type { Inputs } from '../src/engine/world.ts';
import baseChar from '../characters/base/character.json' with { type: 'json' };

const characters = { base: parseCharacter(baseChar) };
const noInput: Inputs = { players: [{ buttons: 0 }, { buttons: 0 }] };
const p1Right: Inputs = { players: [{ buttons: Btn.Right }, { buttons: 0 }] };
const p1Left: Inputs = { players: [{ buttons: Btn.Left }, { buttons: 0 }] };
const p1Up: Inputs = { players: [{ buttons: Btn.Up }, { buttons: 0 }] };
const p1Punch: Inputs = { players: [{ buttons: Btn.A }, { buttons: 0 }] };

describe('tick (state-machine driven)', () => {
  test('world tick increments', () => {
    const w = createWorld();
    expect(w.tick).toBe(0);
    tick(w, characters, noInput);
    expect(w.tick).toBe(1);
  });

  test('player initialised in stand', () => {
    const w = createWorld();
    expect(w.players[0]!.stateId).toBe('stand');
  });

  test('Right press transitions stand -> walk', () => {
    const w = createWorld();
    tick(w, characters, p1Right);
    expect(w.players[0]!.stateId).toBe('walk');
  });

  test('walk -> stand on no input', () => {
    const w = createWorld();
    tick(w, characters, p1Right);
    expect(w.players[0]!.stateId).toBe('walk');
    tick(w, characters, noInput);
    expect(w.players[0]!.stateId).toBe('stand');
  });

  test('walking moves player and clamps to stage right edge', () => {
    const w = createWorld();
    w.players[0]!.pos.x = STAGE_RIGHT_X - 4;
    w.players[1]!.pos.x = 200;
    for (let i = 0; i < 30; i++) tick(w, characters, p1Right);
    expect(w.players[0]!.pos.x).toBe(STAGE_RIGHT_X);
  });

  test('walking left clamps to stage left edge', () => {
    const w = createWorld();
    w.players[0]!.pos.x = STAGE_LEFT_X + 4;
    w.players[1]!.pos.x = 800;
    for (let i = 0; i < 30; i++) tick(w, characters, p1Left);
    expect(w.players[0]!.pos.x).toBe(STAGE_LEFT_X);
  });

  test('jump rises then falls then returns to stand', () => {
    const w = createWorld();
    tick(w, characters, p1Up);
    expect(w.players[0]!.stateId).toBe('jump');
    expect(w.players[0]!.pos.y).toBeGreaterThan(0);

    for (let i = 0; i < 200; i++) {
      tick(w, characters, noInput);
      if (w.players[0]!.stateId === 'stand') break;
    }
    expect(w.players[0]!.stateId).toBe('stand');
    expect(w.players[0]!.pos.y).toBe(0);
  });

  test('punch in range hits opponent and reduces life', () => {
    const w = createWorld();
    w.players[0]!.pos.x = 320;
    w.players[1]!.pos.x = 380;
    const initialLife = w.players[1]!.life;
    for (let i = 0; i < 16; i++) {
      tick(w, characters, p1Punch);
    }
    expect(w.players[1]!.life).toBeLessThan(initialLife);
    expect(w.players[1]!.life).toBe(initialLife - 50);
  });

  test('punch out of range does not hit', () => {
    const w = createWorld();
    w.players[0]!.pos.x = 100;
    w.players[1]!.pos.x = 800;
    for (let i = 0; i < 16; i++) {
      tick(w, characters, p1Punch);
    }
    expect(w.players[1]!.life).toBe(1000);
  });

  test('hit puts victim into hit.stand and applies knockback', () => {
    const w = createWorld();
    w.players[0]!.pos.x = 320;
    w.players[1]!.pos.x = 380;
    const initialP2X = w.players[1]!.pos.x;
    for (let i = 0; i < 30; i++) {
      tick(w, characters, p1Punch);
      if (w.players[1]!.stateId === 'hit.stand') break;
    }
    expect(w.players[1]!.stateId).toBe('hit.stand');
    // After the hit-pause expires (8 ticks) the victim should be sliding right (away from p1).
    for (let i = 0; i < 12; i++) tick(w, characters, noInput);
    expect(w.players[1]!.pos.x).toBeGreaterThan(initialP2X);
  });

  test('determinism — two parallel runs with same inputs match exactly', () => {
    const a = createWorld();
    const b = createWorld();
    const seq: Inputs[] = [
      p1Right,
      p1Right,
      noInput,
      p1Up,
      noInput,
      noInput,
      noInput,
      p1Left,
      noInput,
      p1Punch,
      noInput,
      noInput,
    ];
    for (const inp of seq) {
      tick(a, characters, inp);
      tick(b, characters, inp);
    }
    expect(a).toEqual(b);
  });
});
