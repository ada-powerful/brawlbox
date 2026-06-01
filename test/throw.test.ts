import { describe, expect, test } from 'vitest';
import { detectHits } from '../src/engine/collision.ts';
import { parseCharacter, type HitDef, type ThrowDef } from '../src/engine/schema.ts';
import { tick } from '../src/engine/tick.ts';
import { applyBinds, applyThrows, detectThrows } from '../src/engine/throw.ts';
import { Btn, createWorld, type Inputs } from '../src/engine/world.ts';
import baseChar from '../characters/base/character.json' with { type: 'json' };

const character = parseCharacter(baseChar);
const characters = { base: character };

const punch: HitDef = {
  attr: { state: 'S', class: 'NA' },
  damage: { hit: 50, guard: 5 },
  hitFlag: 'MAF',
  guardFlag: 'MA',
  pauseTime: { p1: 8, p2: 8 },
  groundHitTime: 12,
  groundVelocity: { x: 4, y: 0 },
  airVelocity: { x: 3, y: 4 },
  priority: 3,
};

const grab: ThrowDef = {
  range: { x: 70, y: 40 },
  damage: 90,
  attackerState: 'throw.exec',
  releaseState: 'hit.air',
  bindTime: 18,
  bindPos: { x: 55, y: 0 },
  throwVel: { x: 6, y: 8 },
};

describe('detectThrows', () => {
  test('grabs an opponent in range and in front', () => {
    const w = createWorld();
    const a = w.players[0]!;
    a.activeThrow = grab;
    a.pos.x = 360;
    a.facing = 1;
    w.players[1]!.pos.x = 420; // bodyDist = 60 - 30 - 30 = 0
    expect(detectThrows(w)).toEqual([{ attackerIdx: 0, victimIdx: 1 }]);
  });

  test('no grab when out of range', () => {
    const w = createWorld();
    const a = w.players[0]!;
    a.activeThrow = grab;
    a.pos.x = 360;
    w.players[1]!.pos.x = 600; // bodyDist = 240 - 60 = 180 > 70
    expect(detectThrows(w)).toEqual([]);
  });

  test('no grab when victim is behind the attacker', () => {
    const w = createWorld();
    const a = w.players[0]!;
    a.activeThrow = grab;
    a.pos.x = 360;
    a.facing = 1;
    w.players[1]!.pos.x = 320; // in range but behind (forward < 0)
    expect(detectThrows(w)).toEqual([]);
  });

  test('no grab on an airborne victim', () => {
    const w = createWorld();
    const a = w.players[0]!;
    a.activeThrow = grab;
    a.pos.x = 360;
    const v = w.players[1]!;
    v.pos.x = 420;
    v.pos.y = 50; // airborne, beyond range.y too
    expect(detectThrows(w)).toEqual([]);
  });

  test('no grab on an already-bound victim', () => {
    const w = createWorld();
    const a = w.players[0]!;
    a.activeThrow = grab;
    a.pos.x = 360;
    const v = w.players[1]!;
    v.pos.x = 420;
    v.bind = { thrower: 0, time: 5, pos: { x: 55, y: 0 }, releaseVel: { x: 6, y: 8 }, releaseState: 'hit.air' };
    expect(detectThrows(w)).toEqual([]);
  });
});

describe('applyThrows', () => {
  test('binds the victim and sends the attacker to its throw state', () => {
    const w = createWorld();
    const a = w.players[0]!;
    const v = w.players[1]!;
    a.activeThrow = grab;
    a.pos.x = 360;
    v.pos.x = 420;
    v.life = 1000;

    applyThrows([{ attackerIdx: 0, victimIdx: 1 }], w, characters);

    expect(v.bind).not.toBeNull();
    expect(v.bind?.thrower).toBe(0);
    expect(v.bind?.time).toBe(18);
    expect(v.ctrl).toBe(false);
    expect(v.life).toBe(910);
    expect(v.stateId).toBe('thrown');
    expect(a.stateId).toBe('throw.exec');
    expect(a.activeThrow).toBeNull();
    expect(v.activeThrow).toBeNull();
  });

  test('victim is immediately positioned at the bind offset', () => {
    const w = createWorld();
    const a = w.players[0]!;
    const v = w.players[1]!;
    a.activeThrow = grab;
    a.pos.x = 360;
    a.facing = 1;
    v.pos.x = 420;

    applyThrows([{ attackerIdx: 0, victimIdx: 1 }], w, characters);
    expect(v.pos.x).toBe(360 + 55); // thrower.pos.x + bindPos.x * facing
    expect(v.pos.y).toBe(0);
  });
});

describe('applyBinds', () => {
  function bindVictim(time: number) {
    const w = createWorld();
    const thrower = w.players[0]!;
    const v = w.players[1]!;
    thrower.pos.x = 360;
    thrower.facing = 1;
    thrower.ctrl = false; // thrower is mid-throw (its throw state is ctrl: 0)
    v.bind = { thrower: 0, time, pos: { x: 55, y: 0 }, releaseVel: { x: 6, y: 8 }, releaseState: 'hit.air' };
    v.ctrl = false;
    return { w, thrower, v };
  }

  test('counts down and repositions while held', () => {
    const { w, v } = bindVictim(5);
    applyBinds(w, characters);
    expect(v.bind?.time).toBe(4);
    expect(v.pos.x).toBe(415);
    expect(v.facing).toBe(-1); // faces the thrower
  });

  test('releases with a facing-relative toss when the timer expires', () => {
    const { w, v } = bindVictim(1);
    applyBinds(w, characters);
    expect(v.bind).toBeNull();
    expect(v.vel.x).toBe(6); // throwVel.x * thrower.facing (1)
    expect(v.vel.y).toBe(8);
    expect(v.stateId).toBe('hit.air');
  });

  test('toss direction flips with thrower facing', () => {
    const { w, thrower, v } = bindVictim(1);
    thrower.facing = -1;
    applyBinds(w, characters);
    expect(v.vel.x).toBe(-6);
  });

  test('releases immediately if the thrower is KO’d', () => {
    const { w, thrower, v } = bindVictim(10);
    thrower.stateId = 'ko';
    applyBinds(w, characters);
    expect(v.bind).toBeNull();
    expect(v.stateId).toBe('hit.air');
  });

  test('KO release tosses in the thrower’s facing, not a hardcoded direction', () => {
    const { w, thrower, v } = bindVictim(10);
    thrower.facing = -1;
    thrower.stateId = 'ko';
    applyBinds(w, characters);
    expect(v.vel.x).toBe(-6); // releaseVel.x (6) * thrower.facing (-1)
  });

  test('releases early when the thrower regains control', () => {
    const { w, thrower, v } = bindVictim(10);
    thrower.ctrl = true; // recovered before the hold timer elapsed
    applyBinds(w, characters);
    expect(v.bind).toBeNull();
    expect(v.vel.x).toBe(6);
  });
});

describe('release fail-safe', () => {
  test('a victim whose char lacks the reaction state is released actionable, not soft-locked', () => {
    // Minimal character with no hit.air / no release state: just a stand state.
    const tiny = parseCharacter({
      meta: { id: 'tiny', name: 'Tiny', author: 't', version: '0' },
      data: {
        life: 1000,
        attack: 100,
        defence: 100,
        walkFwd: 3,
        walkBack: -2,
        jumpVel: { x: 0, y: 9 },
        gravity: 0.5,
        groundFriction: 0.85,
      },
      size: { width: 60, height: 100, headY: 92 },
      // No 'stand', 'hit.air', or matching release state — nothing to fall back to.
      states: {
        idle: { type: 'S', moveType: 'I', physics: 'S', controllers: [] },
      },
    });
    const w = createWorld('base', 'tiny');
    const v = w.players[1]!;
    v.bind = {
      thrower: 0,
      time: 1,
      pos: { x: 55, y: 0 },
      releaseVel: { x: 6, y: 8 },
      releaseState: 'nope',
    };
    v.ctrl = false;
    applyBinds(w, { base: character, tiny });
    expect(v.bind).toBeNull();
    // No reaction state resolved → fail safe to actionable rather than soft-lock.
    expect(v.ctrl).toBe(true);
  });
});

describe('throws vs strikes', () => {
  test('a bound victim is not registered as hit by an active hitbox', () => {
    const w = createWorld();
    const a = w.players[0]!;
    const v = w.players[1]!;
    // Put the attacker mid-punch with an overlapping hitbox.
    a.stateId = 'punch';
    a.animId = 'punch';
    a.animFrame = 1;
    a.animTime = 0;
    a.activeHitDef = punch;
    a.pos.x = 360;
    v.pos.x = 400;
    v.bind = { thrower: 1, time: 5, pos: { x: 55, y: 0 }, releaseVel: { x: 6, y: 8 }, releaseState: 'hit.air' };
    expect(detectHits(w, characters)).toEqual([]);
  });
});

describe('throw integration (full tick)', () => {
  test('holding the grab button next to the opponent throws them', () => {
    const w = createWorld();
    w.players[0]!.pos.x = 360;
    w.players[1]!.pos.x = 420; // within grab range
    const inputs: Inputs = { players: [{ buttons: Btn.B }, { buttons: 0 }] };

    // Tick 1: stand -> throw.start. Tick 2: Throw arms + grab connects.
    tick(w, characters, inputs);
    expect(w.players[0]!.stateId).toBe('throw.start');
    tick(w, characters, inputs);

    expect(w.players[0]!.stateId).toBe('throw.exec');
    expect(w.players[1]!.bind).not.toBeNull();
    expect(w.players[1]!.life).toBe(910);

    // Run out the bind; the victim should be released and eventually recover.
    for (let i = 0; i < 60; i++) tick(w, characters, { players: [{ buttons: 0 }, { buttons: 0 }] });
    expect(w.players[1]!.bind).toBeNull();
  });
});
