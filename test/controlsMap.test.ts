import { describe, expect, it } from 'vitest';
import { parseCharacter, type Character } from '@/engine/schema.ts';
import { buildControlsMap } from '@/creator/controlsMap.ts';

// A minimal character exercising: a button input (stand→punch via x), a
// directional movement input (stand→walk via left/right), an automatic return
// (punch→stand via time), a passive reaction (hit.stand), and an orphan anim.
function fixture(): Character {
  return parseCharacter({
    meta: { id: 'tc', name: 'TC', author: 't', version: '0' },
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
    size: { width: 60, height: 110, headY: 100 },
    animations: {
      stand: { loop: true, frames: [{ sprite: 'stand-0', duration: 6 }] },
      walk: { loop: true, frames: [{ sprite: 'walk-0', duration: 6 }, { sprite: 'walk-1', duration: 6 }] },
      punch: { loop: false, frames: [{ sprite: 'punch-0', duration: 4 }, { sprite: 'punch-1', duration: 4 }] },
      hit: { loop: false, frames: [{ sprite: 'hit-0', duration: 4 }] },
      taunt: { loop: false, frames: [{ sprite: 'taunt-0', duration: 4 }] },
    },
    states: {
      stand: {
        type: 'S',
        moveType: 'I',
        physics: 'S',
        anim: 'stand',
        ctrl: 1,
        controllers: [
          { type: 'ChangeState', value: 'punch', trigger: { op: 'button', held: 'x' } },
          {
            type: 'ChangeState',
            value: 'walk',
            trigger: {
              op: 'or',
              args: [
                { op: 'button', held: 'left' },
                { op: 'button', held: 'right' },
              ],
            },
          },
        ],
      },
      walk: {
        type: 'S',
        moveType: 'I',
        physics: 'N',
        anim: 'walk',
        ctrl: 1,
        controllers: [
          {
            type: 'ChangeState',
            value: 'stand',
            trigger: {
              op: 'and',
              args: [
                { op: 'not', arg: { op: 'button', held: 'left' } },
                { op: 'not', arg: { op: 'button', held: 'right' } },
              ],
            },
          },
        ],
      },
      punch: {
        type: 'S',
        moveType: 'A',
        physics: 'N',
        anim: 'punch',
        ctrl: 0,
        controllers: [
          {
            type: 'ChangeState',
            value: 'stand',
            trigger: { op: 'ge', left: { ref: 'time' }, right: { const: 8 } },
          },
        ],
      },
      'hit.stand': {
        type: 'S',
        moveType: 'H',
        physics: 'S',
        anim: 'hit',
        ctrl: 0,
        controllers: [
          {
            type: 'ChangeState',
            value: 'stand',
            trigger: { op: 'ge', left: { ref: 'time' }, right: { const: 12 } },
          },
        ],
      },
    },
  });
}

describe('buildControlsMap', () => {
  it('classifies button/direction transitions as inputs and the rest as passive', () => {
    const { inputs, passive } = buildControlsMap(fixture());

    const punch = inputs.find((r) => r.id === 'punch');
    expect(punch).toBeDefined();
    expect(punch!.group).toBe('attack');
    expect(punch!.frames).toEqual(['punch-0', 'punch-1']);
    // stand → punch via the X button: the P1 key for `x` is U.
    expect(punch!.inputs).toHaveLength(1);
    expect(punch!.inputs[0]!.keys).toEqual(['U']);
    expect(punch!.inputs[0]!.from).toBe('stand');

    // walk is reached by an OR of two buttons → collapsed to one A/D token.
    const walk = inputs.find((r) => r.id === 'walk');
    expect(walk).toBeDefined();
    expect(walk!.inputs[0]!.keys).toEqual(['A/D']);

    // stand (idle) and hit.stand (reaction) have no input transition → passive.
    const passiveIds = passive.map((r) => r.id);
    expect(passiveIds).toContain('stand');
    expect(passiveIds).toContain('hit.stand');
    expect(inputs.map((r) => r.id)).not.toContain('stand');

    // `taunt` is declared as an animation but used by no state → display-only passive.
    expect(passiveIds).toContain('taunt');
  });

  it('does not treat a release-only (charge) trigger and a pure timer the same', () => {
    const { passive } = buildControlsMap(fixture());
    // punch → stand is a pure timer (no input), so punch is NOT reached passively
    // via that edge; punch must be an input row, not duplicated into passive.
    expect(passive.map((r) => r.id)).not.toContain('punch');
  });
});
