import { describe, expect, test } from 'vitest';
import { advanceAnimation, getActiveFrame, setAnimation } from '../src/engine/animation.ts';
import type { Character } from '../src/engine/schema.ts';
import type { Player } from '../src/engine/world.ts';

function makePlayer(animId = 'test', animFrame = 0, animTime = 0): Player {
  return {
    characterId: 'c',
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    facing: 1,
    stateId: 'stand',
    stateTime: 0,
    ctrl: true,
    animId,
    animFrame,
    animTime,
  };
}

function makeCharacter(animations: Character['animations']): Character {
  return {
    meta: { id: 'c', name: 'c', author: 'c', version: '0.0.0' },
    data: {
      life: 1000,
      attack: 100,
      defence: 100,
      walkFwd: 3,
      walkBack: -2.4,
      jumpVel: { x: 0, y: 9 },
      gravity: 0.5,
      groundFriction: 0.85,
    },
    size: { width: 60, height: 100, headY: 92 },
    states: {
      stand: { type: 'S', moveType: 'I', physics: 'S', controllers: [] },
    },
    animations,
  };
}

describe('setAnimation', () => {
  test('changes animId and resets animFrame/animTime', () => {
    const p = makePlayer('a', 5, 12);
    setAnimation(p, 'b');
    expect(p.animId).toBe('b');
    expect(p.animFrame).toBe(0);
    expect(p.animTime).toBe(0);
  });

  test('no-op when animId unchanged (preserves animFrame/animTime)', () => {
    const p = makePlayer('a', 5, 12);
    setAnimation(p, 'a');
    expect(p.animFrame).toBe(5);
    expect(p.animTime).toBe(12);
  });
});

describe('advanceAnimation', () => {
  test('animTime increments while frame duration not exceeded', () => {
    const c = makeCharacter({
      test: {
        loop: true,
        frames: [
          { sprite: 's', duration: 8, offset: { x: 0, y: 0 }, hitboxes: [], hurtboxes: [] },
        ],
      },
    });
    const p = makePlayer('test');
    advanceAnimation(p, c);
    expect(p.animTime).toBe(1);
    advanceAnimation(p, c);
    expect(p.animTime).toBe(2);
  });

  test('frame plays for exactly `duration` ticks before advancing', () => {
    const c = makeCharacter({
      test: {
        loop: true,
        frames: [
          { sprite: 'a', duration: 3, offset: { x: 0, y: 0 }, hitboxes: [], hurtboxes: [] },
          { sprite: 'b', duration: 5, offset: { x: 0, y: 0 }, hitboxes: [], hurtboxes: [] },
        ],
      },
    });
    const p = makePlayer('test');
    // duration=3 means animTime goes 0,1,2 then advances on the 3rd advanceAnimation call
    advanceAnimation(p, c); // 0 -> 1
    expect([p.animFrame, p.animTime]).toEqual([0, 1]);
    advanceAnimation(p, c); // 1 -> 2
    expect([p.animFrame, p.animTime]).toEqual([0, 2]);
    advanceAnimation(p, c); // 2 -> would be 3, advance to frame 1
    expect([p.animFrame, p.animTime]).toEqual([1, 0]);
  });

  test('loop wraps to frame 0 at end', () => {
    const c = makeCharacter({
      test: {
        loop: true,
        frames: [
          { sprite: 'a', duration: 2, offset: { x: 0, y: 0 }, hitboxes: [], hurtboxes: [] },
          { sprite: 'b', duration: 2, offset: { x: 0, y: 0 }, hitboxes: [], hurtboxes: [] },
        ],
      },
    });
    const p = makePlayer('test');
    advanceAnimation(p, c); // f=0 t=1
    advanceAnimation(p, c); // f=1 t=0
    expect([p.animFrame, p.animTime]).toEqual([1, 0]);
    advanceAnimation(p, c); // f=1 t=1
    advanceAnimation(p, c); // f=0 t=0 (wrap)
    expect([p.animFrame, p.animTime]).toEqual([0, 0]);
  });

  test('non-loop clamps animTime at last frame', () => {
    const c = makeCharacter({
      test: {
        loop: false,
        frames: [
          { sprite: 'a', duration: 2, offset: { x: 0, y: 0 }, hitboxes: [], hurtboxes: [] },
          { sprite: 'b', duration: 2, offset: { x: 0, y: 0 }, hitboxes: [], hurtboxes: [] },
        ],
      },
    });
    const p = makePlayer('test');
    for (let i = 0; i < 20; i++) advanceAnimation(p, c);
    expect(p.animFrame).toBe(1);
    expect(p.animTime).toBe(1);
  });

  test('duration=-1 holds frame and increments animTime forever', () => {
    const c = makeCharacter({
      test: {
        loop: false,
        frames: [
          { sprite: 'a', duration: -1, offset: { x: 0, y: 0 }, hitboxes: [], hurtboxes: [] },
        ],
      },
    });
    const p = makePlayer('test');
    for (let i = 0; i < 100; i++) advanceAnimation(p, c);
    expect(p.animFrame).toBe(0);
    expect(p.animTime).toBe(100);
  });

  test('no-op when animId not in character.animations', () => {
    const c = makeCharacter({});
    const p = makePlayer('missing', 3, 5);
    advanceAnimation(p, c);
    expect([p.animFrame, p.animTime]).toEqual([3, 5]);
  });

  test('out-of-bounds animFrame resets to 0', () => {
    const c = makeCharacter({
      test: {
        loop: true,
        frames: [
          { sprite: 'a', duration: 2, offset: { x: 0, y: 0 }, hitboxes: [], hurtboxes: [] },
        ],
      },
    });
    const p = makePlayer('test', 99, 0);
    advanceAnimation(p, c);
    expect([p.animFrame, p.animTime]).toEqual([0, 0]);
  });
});

describe('getActiveFrame', () => {
  test('returns the current frame', () => {
    const c = makeCharacter({
      test: {
        loop: true,
        frames: [
          { sprite: 'a', duration: 2, offset: { x: 0, y: 0 }, hitboxes: [], hurtboxes: [] },
          { sprite: 'b', duration: 3, offset: { x: 0, y: 0 }, hitboxes: [], hurtboxes: [] },
        ],
      },
    });
    const p = makePlayer('test', 1, 0);
    expect(getActiveFrame(p, c)?.sprite).toBe('b');
  });

  test('returns undefined for unknown anim', () => {
    expect(getActiveFrame(makePlayer('x'), makeCharacter({}))).toBeUndefined();
  });
});
