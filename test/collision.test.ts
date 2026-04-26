import { describe, expect, test } from 'vitest';
import {
  applyPushCollision,
  detectHits,
  overlap,
  translateBox,
} from '../src/engine/collision.ts';
import { parseCharacter } from '../src/engine/schema.ts';
import { createWorld, STAGE_LEFT_X, STAGE_RIGHT_X } from '../src/engine/world.ts';
import baseChar from '../characters/base/character.json' with { type: 'json' };

const characters = { base: parseCharacter(baseChar) };

describe('overlap (AABB)', () => {
  test('boxes overlapping', () => {
    expect(
      overlap(
        { minX: 0, maxX: 10, minY: 0, maxY: 10 },
        { minX: 5, maxX: 15, minY: 5, maxY: 15 },
      ),
    ).toBe(true);
  });

  test('boxes touching edges (strict, not overlapping)', () => {
    expect(
      overlap(
        { minX: 0, maxX: 10, minY: 0, maxY: 10 },
        { minX: 10, maxX: 20, minY: 0, maxY: 10 },
      ),
    ).toBe(false);
  });

  test('boxes far apart', () => {
    expect(
      overlap(
        { minX: 0, maxX: 10, minY: 0, maxY: 10 },
        { minX: 100, maxX: 200, minY: 100, maxY: 200 },
      ),
    ).toBe(false);
  });
});

describe('translateBox', () => {
  test('facing right (+1) — no flip', () => {
    const w = createWorld();
    const p = w.players[0]!;
    p.pos.x = 100;
    p.pos.y = 0;
    p.facing = 1;
    expect(translateBox({ x: 30, y: 50, w: 50, h: 30 }, p)).toEqual({
      minX: 130,
      maxX: 180,
      minY: 50,
      maxY: 80,
    });
  });

  test('facing left (-1) — flips x along player axis', () => {
    const w = createWorld();
    const p = w.players[0]!;
    p.pos.x = 100;
    p.pos.y = 0;
    p.facing = -1;
    expect(translateBox({ x: 30, y: 50, w: 50, h: 30 }, p)).toEqual({
      minX: 20,
      maxX: 70,
      minY: 50,
      maxY: 80,
    });
  });
});

describe('detectHits', () => {
  test('no events when attacker has no activeHitDef', () => {
    const w = createWorld();
    expect(detectHits(w, characters)).toEqual([]);
  });

  test('no events when current frame has no hitboxes', () => {
    const w = createWorld();
    w.players[0]!.activeHitDef = {
      attr: { state: 'S', class: 'NA' },
      damage: { hit: 10, guard: 0 },
      hitFlag: 'MAF',
      guardFlag: 'MA',
      pauseTime: { p1: 8, p2: 8 },
      groundHitTime: 12,
      groundVelocity: { x: 4, y: 0 },
      airVelocity: { x: 3, y: 4 },
      priority: 3,
    };
    expect(detectHits(w, characters)).toEqual([]);
  });

  test('detects hit when punch active frame overlaps opponent hurtbox', () => {
    const w = createWorld();
    const p1 = w.players[0]!;
    const p2 = w.players[1]!;
    p1.pos.x = 300;
    p2.pos.x = 360;
    p1.stateId = 'punch';
    p1.animId = 'punch';
    p1.animFrame = 1;
    p1.animTime = 0;
    p1.activeHitDef = {
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
    const events = detectHits(w, characters);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ attackerIdx: 0, victimIdx: 1 });
  });

  test('no hit when out of range', () => {
    const w = createWorld();
    const p1 = w.players[0]!;
    p1.pos.x = 100;
    w.players[1]!.pos.x = 500;
    p1.animId = 'punch';
    p1.animFrame = 1;
    p1.activeHitDef = {
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
    expect(detectHits(w, characters)).toEqual([]);
  });

  test('no hit while victim is in hit-pause', () => {
    const w = createWorld();
    const p1 = w.players[0]!;
    const p2 = w.players[1]!;
    p1.pos.x = 300;
    p2.pos.x = 360;
    p1.animId = 'punch';
    p1.animFrame = 1;
    p1.activeHitDef = {
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
    p2.hitPause = 4;
    expect(detectHits(w, characters)).toEqual([]);
  });
});

describe('applyPushCollision', () => {
  test('both grounded — pushes apart symmetrically', () => {
    const w = createWorld();
    w.players[0]!.pos.x = 400;
    w.players[1]!.pos.x = 440;
    applyPushCollision(w, characters);
    expect(w.players[0]!.pos.x).toBeLessThan(400);
    expect(w.players[1]!.pos.x).toBeGreaterThan(440);
    const sep = w.players[1]!.pos.x - w.players[0]!.pos.x;
    expect(sep).toBeGreaterThanOrEqual(60);
  });

  test('one airborne — only grounded one moves', () => {
    const w = createWorld();
    w.players[0]!.pos.x = 400;
    w.players[0]!.pos.y = 50;
    w.players[1]!.pos.x = 440;
    applyPushCollision(w, characters);
    expect(w.players[0]!.pos.x).toBe(400);
    expect(w.players[1]!.pos.x).toBeGreaterThan(440);
  });

  test('cornered: rebound transfers to opponent', () => {
    const w = createWorld();
    w.players[0]!.pos.x = STAGE_LEFT_X;
    w.players[1]!.pos.x = STAGE_LEFT_X + 30;
    applyPushCollision(w, characters);
    expect(w.players[0]!.pos.x).toBe(STAGE_LEFT_X);
    expect(w.players[1]!.pos.x).toBeGreaterThanOrEqual(STAGE_LEFT_X + 60);
  });

  test('right-corner cornered: rebound transfers left', () => {
    const w = createWorld();
    w.players[0]!.pos.x = STAGE_RIGHT_X - 30;
    w.players[1]!.pos.x = STAGE_RIGHT_X;
    applyPushCollision(w, characters);
    expect(w.players[1]!.pos.x).toBe(STAGE_RIGHT_X);
    expect(w.players[0]!.pos.x).toBeLessThanOrEqual(STAGE_RIGHT_X - 60);
  });

  test('no push when not overlapping', () => {
    const w = createWorld();
    w.players[0]!.pos.x = 200;
    w.players[1]!.pos.x = 700;
    applyPushCollision(w, characters);
    expect(w.players[0]!.pos.x).toBe(200);
    expect(w.players[1]!.pos.x).toBe(700);
  });

  test('no push during hit-pause', () => {
    const w = createWorld();
    w.players[0]!.pos.x = 400;
    w.players[1]!.pos.x = 440;
    w.players[0]!.hitPause = 4;
    applyPushCollision(w, characters);
    expect(w.players[0]!.pos.x).toBe(400);
    expect(w.players[1]!.pos.x).toBe(440);
  });
});
