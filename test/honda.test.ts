import { describe, expect, test } from 'vitest';
import { hashWorld } from '../src/engine/serialize.ts';
import { tick } from '../src/engine/tick.ts';
import { Btn, createWorld, type Inputs, type World } from '../src/engine/world.ts';
import { HONDA_CHARACTER } from '../src/sandbox/honda.ts';

const characters = { honda: HONDA_CHARACTER };

function world(): World {
  return createWorld('honda', 'honda');
}

const rep = (b: number, n: number): number[] => Array.from({ length: n }, () => b);

/** Run P1 through a per-tick button script; return every stateId P1 visited. */
function driveP1(w: World, frames: number[], p2 = 0): Set<string> {
  const visited = new Set<string>();
  for (const b of frames) {
    tick(w, characters, { players: [{ buttons: b }, { buttons: p2 }] });
    const p1 = w.players[0];
    if (p1) visited.add(p1.stateId);
  }
  return visited;
}

// P1 starts at x=360 facing P2 at x=600 ⇒ facing +1, so Back = Left, Forward = Right.
const L = Btn.Left;
const R = Btn.Right;
const D = Btn.Down;
const U = Btn.Up;

describe('Honda character builds and validates', () => {
  test('parseCharacter accepted the full moveset', () => {
    expect(HONDA_CHARACTER.meta.id).toBe('honda');
    for (const s of ['headbutt', 'sumoSplash', 'hundredSlap', 'superHeadbutt', 'oicho', 'oicho.exec']) {
      expect(HONDA_CHARACTER.states[s]).toBeDefined();
    }
    const cmdNames = (HONDA_CHARACTER.commands ?? []).map((c) => c.name);
    expect(cmdNames).toEqual(expect.arrayContaining(['headbutt', 'splash', 'slap', 'superheadbutt', 'oicho']));
  });
});

describe('charge specials', () => {
  test('Sumo Headbutt: charge back, then forward + x', () => {
    const w = world();
    const frames = [...rep(L, 40), R, R, R | Btn.X, R | Btn.X, Btn.X, Btn.X, 0, 0];
    const visited = driveP1(w, frames);
    expect(visited.has('headbutt')).toBe(true);
  });

  test('a forward+x with no charge does NOT headbutt', () => {
    const w = world();
    // Only a couple of back frames — well under the 35-tick charge requirement.
    const frames = [L, L, R, R | Btn.X, Btn.X, 0];
    const visited = driveP1(w, frames);
    expect(visited.has('headbutt')).toBe(false);
  });

  test('Sumo Splash: charge down, then up + a (anti-air leap)', () => {
    const w = world();
    const frames = [...rep(D, 40), U | Btn.A, U | Btn.A, Btn.A, 0, 0];
    const visited = driveP1(w, frames);
    expect(visited.has('sumoSplash')).toBe(true);
  });
});

describe('mash special', () => {
  test('Hundred Hand Slap: mashing y three times', () => {
    const w = world();
    // Tap y with release gaps so the three presses register as distinct.
    const frames = [Btn.Y, 0, Btn.Y, 0, Btn.Y, 0, Btn.Y, 0];
    const visited = driveP1(w, frames);
    expect(visited.has('hundredSlap')).toBe(true);
  });
});

describe('power meter & super', () => {
  test('Super Headbutt requires meter and drains it; plain charge headbutts without', () => {
    // Without meter: the same super input falls through to the regular headbutt.
    const noMeter = world();
    const superInput = [...rep(L, 50), R, R, R | Btn.X | Btn.Z, R | Btn.X | Btn.Z, Btn.X | Btn.Z, 0, 0];
    const v1 = driveP1(noMeter, superInput);
    expect(v1.has('superHeadbutt')).toBe(false);
    expect(v1.has('headbutt')).toBe(true);

    // With a full bar: supers and the meter drains to 0.
    const full = world();
    full.players[0]!.power = 1000;
    const v2 = driveP1(full, superInput);
    expect(v2.has('superHeadbutt')).toBe(true);
    expect(full.players[0]!.power).toBe(0);
  });

  test('specials build power', () => {
    const w = world();
    driveP1(w, [...rep(L, 40), R, R, R | Btn.X, R | Btn.X, 0, 0]); // headbutt grants +120
    expect(w.players[0]!.power).toBeGreaterThan(0);
  });
});

describe('command grab (Oicho Throw)', () => {
  test('HCB + b near the opponent binds them', () => {
    const w = world();
    w.players[0]!.pos.x = 360;
    w.players[1]!.pos.x = 430; // within the 80px grab range
    // Half-circle-back F,DF,D,DB,B then b (facing +1).
    const frames = [R, D | R, D, D | L, L, Btn.B, Btn.B, Btn.B, 0, 0];
    const visited = driveP1(w, frames);
    expect(visited.has('oicho')).toBe(true);
    expect(w.players[1]!.bind).not.toBeNull();
  });
});

describe('determinism', () => {
  test('two Honda worlds stay hash-identical over 600 ticks of seeded input', () => {
    const log: Inputs[] = [];
    let s = 0x1234abcd >>> 0;
    const next = (): number => {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      return s;
    };
    for (let i = 0; i < 600; i++) {
      log.push({ players: [{ buttons: next() & 0x3ff }, { buttons: next() & 0x3ff }] });
    }

    const a = world();
    const b = world();
    for (let i = 0; i < log.length; i++) {
      tick(a, characters, log[i]!);
      tick(b, characters, log[i]!);
      expect(hashWorld(a)).toBe(hashWorld(b));
    }
  });
});
