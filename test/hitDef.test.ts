import { describe, expect, test } from 'vitest';
import { applyHit } from '../src/engine/hitDef.ts';
import type { HitDef } from '../src/engine/schema.ts';
import { parseCharacter } from '../src/engine/schema.ts';
import { createWorld } from '../src/engine/world.ts';
import baseChar from '../characters/base/character.json' with { type: 'json' };

const character = parseCharacter(baseChar);

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

describe('applyHit', () => {
  test('reduces life by damage.hit', () => {
    const w = createWorld();
    const a = w.players[0]!;
    const v = w.players[1]!;
    a.activeHitDef = punch;
    applyHit(a, v, punch, character);
    expect(v.life).toBe(950);
  });

  test('clamps life to 0', () => {
    const w = createWorld();
    const a = w.players[0]!;
    const v = w.players[1]!;
    v.life = 30;
    applyHit(a, v, punch, character);
    expect(v.life).toBe(0);
  });

  test('grounded victim transitions to hit.stand', () => {
    const w = createWorld();
    const a = w.players[0]!;
    const v = w.players[1]!;
    v.pos.y = 0;
    applyHit(a, v, punch, character);
    expect(v.stateId).toBe('hit.stand');
    expect(v.stateTime).toBe(0);
  });

  test('airborne victim transitions to hit.air', () => {
    const w = createWorld();
    const a = w.players[0]!;
    const v = w.players[1]!;
    v.pos.y = 50;
    applyHit(a, v, punch, character);
    expect(v.stateId).toBe('hit.air');
  });

  test('an upward-launching hit sends a GROUNDED victim airborne (not the gravity-less stand-hit)', () => {
    const w = createWorld();
    const a = w.players[0]!;
    const v = w.players[1]!;
    v.pos.y = 0; // on the ground
    const launcher: HitDef = { ...punch, groundVelocity: { x: 4, y: 9 } };
    applyHit(a, v, launcher, character);
    expect(v.stateId).toBe('hit.air'); // airborne reaction → has gravity → falls back
    expect(v.vel.y).toBe(9);
  });

  test('a flat (non-launching) grounded hit still uses hit.stand', () => {
    const w = createWorld();
    const a = w.players[0]!;
    const v = w.players[1]!;
    applyHit(a, v, punch, character); // groundVelocity.y === 0
    expect(v.stateId).toBe('hit.stand');
  });

  test('knockback velocity flips with attacker.facing', () => {
    const w = createWorld();
    const a = w.players[0]!;
    const v = w.players[1]!;
    a.facing = 1;
    applyHit(a, v, punch, character);
    expect(v.vel.x).toBe(4);
    v.vel.x = 0;
    a.facing = -1;
    applyHit(a, v, punch, character);
    expect(v.vel.x).toBe(-4);
  });

  test('air knockback uses airVelocity', () => {
    const w = createWorld();
    const a = w.players[0]!;
    const v = w.players[1]!;
    v.pos.y = 50;
    a.facing = 1;
    applyHit(a, v, punch, character);
    expect(v.vel.x).toBe(3);
    expect(v.vel.y).toBe(4);
  });

  test('hit-pause set on both attacker and victim', () => {
    const w = createWorld();
    const a = w.players[0]!;
    const v = w.players[1]!;
    applyHit(a, v, punch, character);
    expect(a.hitPause).toBe(8);
    expect(v.hitPause).toBe(8);
  });

  test('attacker.activeHitDef cleared after hit', () => {
    const w = createWorld();
    const a = w.players[0]!;
    const v = w.players[1]!;
    a.activeHitDef = punch;
    applyHit(a, v, punch, character);
    expect(a.activeHitDef).toBeNull();
  });

  test('victim.ctrl set to 0 (loses control via hit-state header)', () => {
    const w = createWorld();
    const a = w.players[0]!;
    const v = w.players[1]!;
    v.ctrl = true;
    applyHit(a, v, punch, character);
    expect(v.ctrl).toBe(false);
  });
});
