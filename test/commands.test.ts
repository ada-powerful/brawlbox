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
