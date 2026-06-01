import { describe, expect, test } from 'vitest';
import {
  INPUT_BUFFER_SIZE,
  matchMotion,
  parseMotion,
  recordInput,
  stepToMask,
} from '../src/engine/commands.ts';
import { Btn } from '../src/engine/world.ts';

describe('parseMotion', () => {
  test('single button', () => {
    expect(parseMotion('x')).toEqual([{ dir: null, buttons: ['x'] }]);
  });

  test('single direction', () => {
    expect(parseMotion('F')).toEqual([{ dir: 'F', buttons: [] }]);
    expect(parseMotion('DF')).toEqual([{ dir: 'DF', buttons: [] }]);
  });

  test('+ combines direction and button', () => {
    expect(parseMotion('F+x')).toEqual([{ dir: 'F', buttons: ['x'] }]);
  });

  test('+ combines multiple buttons', () => {
    expect(parseMotion('a+b')).toEqual([{ dir: null, buttons: ['a', 'b'] }]);
  });

  test('comma separates steps', () => {
    expect(parseMotion('D, DF, F, x')).toEqual([
      { dir: 'D', buttons: [] },
      { dir: 'DF', buttons: [] },
      { dir: 'F', buttons: [] },
      { dir: null, buttons: ['x'] },
    ]);
  });

  test('strips leading ~ (negative-edge deferred)', () => {
    expect(parseMotion('~D, F, x')).toEqual([
      { dir: 'D', buttons: [] },
      { dir: 'F', buttons: [] },
      { dir: null, buttons: ['x'] },
    ]);
  });

  test('whitespace is tolerated', () => {
    expect(parseMotion('  D ,DF,  F , x  ')).toEqual([
      { dir: 'D', buttons: [] },
      { dir: 'DF', buttons: [] },
      { dir: 'F', buttons: [] },
      { dir: null, buttons: ['x'] },
    ]);
  });

  test('throws on unknown token', () => {
    expect(() => parseMotion('foo')).toThrow(/Unknown motion token/);
  });

  test('throws on multiple directions in one step', () => {
    expect(() => parseMotion('F+B')).toThrow(/Multiple directions/);
  });

  test('throws on empty motion', () => {
    expect(() => parseMotion('')).toThrow();
    expect(() => parseMotion('   ')).toThrow();
  });

  test('parses charge step [B]30', () => {
    expect(parseMotion('[B]30')).toEqual([{ dir: 'B', buttons: [], charge: 30 }]);
  });

  test('charge motion [D]30,U,a yields 3 steps with charge on first', () => {
    expect(parseMotion('[D]30, U, a')).toEqual([
      { dir: 'D', buttons: [], charge: 30 },
      { dir: 'U', buttons: [] },
      { dir: null, buttons: ['a'] },
    ]);
  });

  test('charge accepts compound directions [DB]40', () => {
    expect(parseMotion('[DB]40')).toEqual([{ dir: 'DB', buttons: [], charge: 40 }]);
  });

  test('Headbutt [B]30,F,x parses', () => {
    expect(parseMotion('[B]30, F, x')).toEqual([
      { dir: 'B', buttons: [], charge: 30 },
      { dir: 'F', buttons: [] },
      { dir: null, buttons: ['x'] },
    ]);
  });

  test('parses held-direction /F', () => {
    expect(parseMotion('/F')).toEqual([{ dir: 'F', buttons: [], hold: true }]);
  });

  test('parses held-direction with button /F+z', () => {
    expect(parseMotion('/F+z')).toEqual([{ dir: 'F', buttons: ['z'], hold: true }]);
  });

  test('throws on charge with bad direction', () => {
    expect(() => parseMotion('[Q]30')).toThrow();
  });
});

describe('stepToMask', () => {
  test('F + facing right => Right', () => {
    expect(stepToMask({ dir: 'F', buttons: [] }, 1)).toBe(Btn.Right);
  });

  test('F + facing left => Left', () => {
    expect(stepToMask({ dir: 'F', buttons: [] }, -1)).toBe(Btn.Left);
  });

  test('B + facing right => Left', () => {
    expect(stepToMask({ dir: 'B', buttons: [] }, 1)).toBe(Btn.Left);
  });

  test('DF + facing right => Down|Right', () => {
    expect(stepToMask({ dir: 'DF', buttons: [] }, 1)).toBe(Btn.Down | Btn.Right);
  });

  test('F+x combines direction and button', () => {
    expect(stepToMask({ dir: 'F', buttons: ['x'] }, 1)).toBe(Btn.Right | Btn.X);
  });
});

describe('matchMotion', () => {
  test('single-button motion matches when held this tick', () => {
    const motion = parseMotion('x');
    expect(matchMotion(motion, [Btn.X], 1, 15)).toBe(true);
  });

  test('single-button does not match if button not held current tick', () => {
    const motion = parseMotion('x');
    expect(matchMotion(motion, [Btn.X, 0], 1, 15)).toBe(false);
  });

  test('QCF+x matches with consecutive ticks', () => {
    const motion = parseMotion('D, DF, F, x');
    const buf = [Btn.Down, Btn.Down | Btn.Right, Btn.Right, Btn.Right | Btn.X];
    expect(matchMotion(motion, buf, 1, 15)).toBe(true);
  });

  test('QCF+x matches with intermediate idle ticks', () => {
    const motion = parseMotion('D, DF, F, x');
    const buf = [Btn.Down, 0, Btn.Down | Btn.Right, 0, Btn.Right, Btn.Right | Btn.X];
    expect(matchMotion(motion, buf, 1, 15)).toBe(true);
  });

  test('QCF+x does not match if last step not at current tick', () => {
    const motion = parseMotion('D, DF, F, x');
    const buf = [Btn.Down, Btn.Down | Btn.Right, Btn.Right | Btn.X, 0];
    expect(matchMotion(motion, buf, 1, 15)).toBe(false);
  });

  test('does not match if order of steps is wrong', () => {
    const motion = parseMotion('D, F');
    const buf = [Btn.Right, Btn.Down];
    expect(matchMotion(motion, buf, 1, 15)).toBe(false);
  });

  test('does not match if motion exceeds window', () => {
    const motion = parseMotion('D, F');
    const buf = [Btn.Down, 0, 0, 0, 0, 0, 0, 0, 0, 0, Btn.Right];
    expect(matchMotion(motion, buf, 1, 5)).toBe(false);
  });

  test('matches at the boundary of the window', () => {
    const motion = parseMotion('D, F');
    const buf = [Btn.Down, 0, 0, 0, Btn.Right];
    expect(matchMotion(motion, buf, 1, 5)).toBe(true);
  });

  test('facing flip: F means Left when facing left', () => {
    const motion = parseMotion('D, DF, F, x');
    const bufP1 = [Btn.Down, Btn.Down | Btn.Right, Btn.Right, Btn.Right | Btn.X];
    const bufP2 = [Btn.Down, Btn.Down | Btn.Left, Btn.Left, Btn.Left | Btn.X];
    expect(matchMotion(motion, bufP1, 1, 15)).toBe(true);
    expect(matchMotion(motion, bufP2, -1, 15)).toBe(true);
  });

  test('empty buffer does not match', () => {
    expect(matchMotion(parseMotion('x'), [], 1, 15)).toBe(false);
  });

  test('F+x simultaneous step matches', () => {
    const motion = parseMotion('F+x');
    expect(matchMotion(motion, [Btn.Right | Btn.X], 1, 15)).toBe(true);
    expect(matchMotion(motion, [Btn.Right], 1, 15)).toBe(false);
    expect(matchMotion(motion, [Btn.X], 1, 15)).toBe(false);
  });

  test('charge [B]30,F,x matches with >=30 held Back then F then x', () => {
    const motion = parseMotion('[B]30, F, x');
    // 30 frames of Back held, then Forward, then Forward+x (current).
    const buf = [
      ...Array(30).fill(Btn.Left), // Back (facing right => Left)
      Btn.Right,
      Btn.Right | Btn.X,
    ];
    expect(matchMotion(motion, buf, 1, 15)).toBe(true);
  });

  test('charge boundary: exactly 30 held frames matches', () => {
    const motion = parseMotion('[B]30, F, x');
    const buf = [...Array(30).fill(Btn.Left), Btn.Right, Btn.Right | Btn.X];
    expect(matchMotion(motion, buf, 1, 15)).toBe(true);
  });

  test('charge does not match when back held < 30 frames', () => {
    const motion = parseMotion('[B]30, F, x');
    const buf = [...Array(29).fill(Btn.Left), Btn.Right, Btn.Right | Btn.X];
    expect(matchMotion(motion, buf, 1, 15)).toBe(false);
  });

  test('charge does not match when F+x come without preceding charge', () => {
    const motion = parseMotion('[B]30, F, x');
    // No Back hold at all, just F then x.
    const buf = [0, 0, 0, Btn.Right, Btn.Right | Btn.X];
    expect(matchMotion(motion, buf, 1, 15)).toBe(false);
  });

  test('charge run may extend further back than windowTicks', () => {
    const motion = parseMotion('[B]30, F, x');
    // 50 frames of charge with a small release window for F,x. Charge >> window.
    const buf = [...Array(50).fill(Btn.Left), Btn.Right, Btn.Right | Btn.X];
    expect(matchMotion(motion, buf, 1, 5)).toBe(true);
  });

  test('charge run interrupted (released mid-hold) does not match', () => {
    const motion = parseMotion('[B]30, F, x');
    // 15 held, a gap, 15 held => no single run of 30.
    const buf = [
      ...Array(15).fill(Btn.Left),
      0,
      ...Array(15).fill(Btn.Left),
      Btn.Right,
      Btn.Right | Btn.X,
    ];
    expect(matchMotion(motion, buf, 1, 15)).toBe(false);
  });

  test('charge facing flip: facing left uses Right for Back', () => {
    const motion = parseMotion('[B]30, F, x');
    // facing -1: Back => Right, Forward => Left.
    const buf = [...Array(30).fill(Btn.Right), Btn.Left, Btn.Left | Btn.X];
    expect(matchMotion(motion, buf, -1, 15)).toBe(true);
  });

  test('sumo splash [D]30,U,a matches', () => {
    const motion = parseMotion('[D]30, U, a');
    const buf = [...Array(30).fill(Btn.Down), Btn.Up, Btn.Up | Btn.A];
    expect(matchMotion(motion, buf, 1, 15)).toBe(true);
  });

  test('held-direction /F,z matches when F held while z pressed', () => {
    const motion = parseMotion('/F, z');
    // F held continuously (no release) then z pressed while still holding F.
    const buf = [Btn.Right, Btn.Right, Btn.Right | Btn.Z];
    expect(matchMotion(motion, buf, 1, 15)).toBe(true);
  });

  test('held-direction /F,z matches without requiring an F release gap', () => {
    const motion = parseMotion('/F, z');
    // Last frame: F+z. Prior frame: F still held (no gap). Should match.
    const buf = [Btn.Right, Btn.Right | Btn.Z];
    expect(matchMotion(motion, buf, 1, 15)).toBe(true);
  });
});

describe('recordInput', () => {
  test('appends inputs', () => {
    const buf: number[] = [];
    recordInput(buf, 1);
    recordInput(buf, 2);
    expect(buf).toEqual([1, 2]);
  });

  test('caps at INPUT_BUFFER_SIZE', () => {
    const buf: number[] = [];
    for (let i = 0; i < INPUT_BUFFER_SIZE + 5; i++) recordInput(buf, i);
    expect(buf.length).toBe(INPUT_BUFFER_SIZE);
    expect(buf[0]).toBe(5);
    expect(buf[buf.length - 1]).toBe(INPUT_BUFFER_SIZE + 4);
  });
});
