import { describe, expect, test } from 'vitest';
import { detectHits } from '../src/engine/collision.ts';
import { applyHit } from '../src/engine/hitDef.ts';
import { parseCharacter, type HitDef } from '../src/engine/schema.ts';
import { createWorld, MAX_OTG, type World } from '../src/engine/world.ts';

// Minimal character with a downed (type L, moveType H) state + a get-up state.
const char = parseCharacter({
  meta: { id: 'otg', name: 'o', author: 'a', version: '0' },
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
  size: { width: 60, height: 100, headY: 90 },
  states: {
    stand: { type: 'S', moveType: 'I', physics: 'S', controllers: [] },
    atk: { type: 'S', moveType: 'A', physics: 'N', anim: 'atk', controllers: [] },
    knockdown: { type: 'L', moveType: 'H', physics: 'S', anim: 'kd', controllers: [] },
    getup: { type: 'C', moveType: 'I', physics: 'S', anim: 'gu', controllers: [] },
  },
  animations: {
    atk: {
      loop: false,
      frames: [
        {
          sprite: 's',
          duration: -1,
          hurtboxes: [{ x: -20, y: 0, w: 40, h: 100 }],
          hitboxes: [{ x: 0, y: 0, w: 90, h: 60 }],
        },
      ],
    },
    kd: {
      loop: false,
      frames: [{ sprite: 's', duration: -1, hurtboxes: [{ x: -40, y: 0, w: 80, h: 24 }] }],
    },
    gu: {
      loop: false,
      frames: [{ sprite: 's', duration: -1, hurtboxes: [{ x: -20, y: 0, w: 40, h: 90 }] }],
    },
  },
});
const characters = { otg: char };

function hitDef(canHitDown: boolean): HitDef {
  return {
    attr: { state: 'C', class: 'NA' },
    damage: { hit: 20, guard: 2 },
    hitFlag: 'MAF',
    guardFlag: 'MA',
    pauseTime: { p1: 4, p2: 4 },
    groundHitTime: 8,
    groundVelocity: { x: 2, y: 0 },
    airVelocity: { x: 2, y: 2 },
    priority: 2,
    canHitDown,
  };
}

function downedWorld(): World {
  const w = createWorld('otg', 'otg');
  const a = w.players[0]!;
  const v = w.players[1]!;
  a.pos.x = 360;
  a.stateId = 'atk';
  a.animId = 'atk';
  a.animFrame = 0;
  v.pos.x = 380; // overlapping the attacker's hitbox
  v.stateId = 'knockdown';
  v.animId = 'kd';
  v.animFrame = 0;
  return w;
}

describe('OTG hit detection', () => {
  test('a non-OTG attack whiffs over a downed victim', () => {
    const w = downedWorld();
    w.players[0]!.activeHitDef = hitDef(false);
    expect(detectHits(w, characters)).toEqual([]);
  });

  test('an OTG attack connects with a downed victim', () => {
    const w = downedWorld();
    w.players[0]!.activeHitDef = hitDef(true);
    expect(detectHits(w, characters)).toEqual([{ attackerIdx: 0, victimIdx: 1 }]);
  });

  test('OTG stops connecting once the limit is reached', () => {
    const w = downedWorld();
    w.players[0]!.activeHitDef = hitDef(true);
    w.players[1]!.otgHits = MAX_OTG;
    expect(detectHits(w, characters)).toEqual([]);
  });
});

describe('OTG application', () => {
  test('each OTG hit re-downs and counts; the limit hit forces wake-up', () => {
    const w = downedWorld();
    const a = w.players[0]!;
    const v = w.players[1]!;

    for (let n = 1; n < MAX_OTG; n++) {
      applyHit(a, v, hitDef(true), char);
      expect(v.otgHits).toBe(n);
      expect(v.stateId).toBe('knockdown'); // still down
      expect(v.stateTime).toBe(0); // timer restarted
    }
    // The limit hit forces a get-up.
    applyHit(a, v, hitDef(true), char);
    expect(v.otgHits).toBe(MAX_OTG);
    expect(v.stateId).toBe('getup');
  });

  test('a downed victim cannot block — OTG ignores guard', () => {
    const w = downedWorld();
    const a = w.players[0]!;
    const v = w.players[1]!;
    v.inputBuffer.push(0x3ff); // holding everything, incl. "back"
    const before = v.life;
    applyHit(a, v, hitDef(true), char);
    expect(v.life).toBe(before - 20); // took the hit, not chip
  });
});
