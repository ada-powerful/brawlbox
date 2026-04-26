import { describe, expect, test } from 'vitest';
import { canonicalize, fnv1a, hashWorld } from '../src/engine/serialize.ts';
import { tick } from '../src/engine/tick.ts';
import { parseCharacter } from '../src/engine/schema.ts';
import { createWorld } from '../src/engine/world.ts';
import type { Inputs } from '../src/engine/world.ts';
import baseChar from '../characters/base/character.json' with { type: 'json' };

const characters = { base: parseCharacter(baseChar) };

function generateInputLog(seed: number, ticks: number): Inputs[] {
  let s = seed >>> 0;
  const next = (): number => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s;
  };
  const log: Inputs[] = [];
  for (let i = 0; i < ticks; i++) {
    log.push({
      players: [{ buttons: next() & 0x3ff }, { buttons: next() & 0x3ff }],
    });
  }
  return log;
}

describe('canonicalize', () => {
  test('object key order does not affect output', () => {
    expect(canonicalize({ a: 1, b: 2, c: 3 } as never)).toBe(
      canonicalize({ c: 3, b: 2, a: 1 } as never),
    );
  });

  test('preserves array order', () => {
    expect(canonicalize([3, 1, 2] as never)).toBe('[3,1,2]');
  });

  test('handles null', () => {
    expect(canonicalize(null as never)).toBe('null');
  });

  test('handles nested objects with mixed key order', () => {
    const a = { z: { b: 1, a: 2 }, q: 3 };
    const b = { q: 3, z: { a: 2, b: 1 } };
    expect(canonicalize(a as never)).toBe(canonicalize(b as never));
  });
});

describe('fnv1a', () => {
  test('is deterministic', () => {
    expect(fnv1a('hello')).toBe(fnv1a('hello'));
  });

  test('returns 32-bit unsigned int', () => {
    const h = fnv1a('arbitrary input');
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(h)).toBe(true);
  });

  test('different strings produce different hashes (probabilistically)', () => {
    expect(fnv1a('foo')).not.toBe(fnv1a('bar'));
  });

  test('empty string hashes to FNV offset basis', () => {
    expect(fnv1a('')).toBe(0x811c9dc5 >>> 0);
  });
});

describe('determinism — the phase-1 done-bar', () => {
  test('two parallel World instances produce identical hashes at every tick (1800 ticks ≈ 30s)', () => {
    const log = generateInputLog(0xdeadbeef, 1800);
    const a = createWorld();
    const b = createWorld();
    for (let i = 0; i < log.length; i++) {
      const inp = log[i]!;
      tick(a, characters, inp);
      tick(b, characters, inp);
      const ha = hashWorld(a);
      const hb = hashWorld(b);
      if (ha !== hb) {
        throw new Error(
          `Determinism diverged at tick ${i}: ${ha.toString(16)} vs ${hb.toString(16)}`,
        );
      }
    }
    expect(hashWorld(a)).toBe(hashWorld(b));
  });

  test('replaying the same log on a fresh World produces the same final hash', () => {
    const log = generateInputLog(0xc0ffee, 600);
    const a = createWorld();
    for (const inp of log) tick(a, characters, inp);
    const hashA = hashWorld(a);

    const b = createWorld();
    for (const inp of log) tick(b, characters, inp);
    const hashB = hashWorld(b);

    expect(hashA).toBe(hashB);
  });

  test('different seeds produce different end states', () => {
    const a = createWorld();
    for (const inp of generateInputLog(1, 200)) tick(a, characters, inp);
    const b = createWorld();
    for (const inp of generateInputLog(2, 200)) tick(b, characters, inp);
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });

  test('structuredClone snapshot equality matches hash equality', () => {
    const log = generateInputLog(0xbeef, 300);
    const a = createWorld();
    const b = createWorld();
    for (const inp of log) {
      tick(a, characters, inp);
      tick(b, characters, inp);
    }
    expect(a).toEqual(b);
    expect(hashWorld(a)).toBe(hashWorld(b));
  });
});
