import { describe, expect, test } from 'vitest';
import { CANONICAL_ACTIONS, GROUP_COLORS, actionGroup, poseFor } from '../src/render/poses.ts';

const BASE = 0xff5577;

describe('canonical action vocabulary', () => {
  test('every canonical action classifies into its declared group', () => {
    for (const action of CANONICAL_ACTIONS) {
      expect(actionGroup(action.id)).toBe(action.group);
    }
  });

  test('ids are unique', () => {
    const ids = CANONICAL_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('covers every action group', () => {
    const groups = new Set(CANONICAL_ACTIONS.map((a) => a.group));
    for (const g of [
      'movement',
      'attack',
      'special',
      'super',
      'throw',
      'guard',
      'hurt',
      'thrown',
      'system',
    ]) {
      expect(groups.has(g as never)).toBe(true);
    }
  });
});

describe('actionGroup classifies ad-hoc anim ids (existing characters)', () => {
  const cases: Array<[string, string]> = [
    ['stand', 'movement'],
    ['walk', 'movement'],
    ['crouch', 'movement'],
    ['jump.rise', 'movement'],
    ['dash', 'movement'],
    ['standLP', 'attack'],
    ['standHP', 'attack'],
    ['crouchHK', 'attack'],
    ['jumpLP', 'attack'],
    ['punch', 'attack'],
    ['special.slap', 'special'],
    ['special.splash', 'special'],
    ['super.headbutt', 'super'],
    ['throw.start', 'throw'],
    ['oicho.exec', 'throw'],
    ['thrown', 'thrown'],
    ['guard.stand', 'guard'],
    ['guard.crouch', 'guard'],
    ['hit.stand', 'hurt'],
    ['hit.air', 'hurt'],
    ['ko', 'system'],
  ];
  for (const [id, group] of cases) {
    test(`${id} → ${group}`, () => {
      expect(actionGroup(id)).toBe(group);
    });
  }
});

describe('poseFor', () => {
  test('movement uses the player tint; action groups use their group colour', () => {
    expect(poseFor('stand', 0, BASE).color).toBe(BASE);
    expect(poseFor('walk', 0, BASE).color).toBe(BASE);
    expect(poseFor('standHP', 1, BASE).color).toBe(GROUP_COLORS.attack);
    expect(poseFor('special.slap', 1, BASE).color).toBe(GROUP_COLORS.special);
    expect(poseFor('super.headbutt', 1, BASE).color).toBe(GROUP_COLORS.super);
    expect(poseFor('oicho', 0, BASE).color).toBe(GROUP_COLORS.throw);
    expect(poseFor('guard.stand', 0, BASE).color).toBe(GROUP_COLORS.guard);
    expect(poseFor('hit.air', 0, BASE).color).toBe(GROUP_COLORS.hurt);
    expect(poseFor('thrown', 0, BASE).color).toBe(GROUP_COLORS.thrown);
    expect(poseFor('ko', 0, BASE).color).toBe(GROUP_COLORS.system);
  });

  test('attacks extend the limb on the active frame', () => {
    const startup = poseFor('standHP', 0, BASE);
    const active = poseFor('standHP', 1, BASE);
    expect(active.arm).toBeGreaterThan(startup.arm);
  });

  test('heavier attacks reach further than lighter ones', () => {
    expect(poseFor('standHP', 1, BASE).arm).toBeGreaterThan(poseFor('standLP', 1, BASE).arm);
  });

  test('crouch / KO poses are shorter than standing', () => {
    expect(poseFor('crouch', 0, BASE).h).toBeLessThan(poseFor('stand', 0, BASE).h);
    expect(poseFor('ko', 0, BASE).h).toBeLessThan(poseFor('stand', 0, BASE).h);
    expect(poseFor('guard.crouch', 0, BASE).h).toBeLessThan(poseFor('guard.stand', 0, BASE).h);
  });

  test('grabs and supers extend a limb; hurt reactions do not', () => {
    expect(poseFor('oicho', 0, BASE).arm).toBeGreaterThan(0);
    expect(poseFor('super.headbutt', 1, BASE).arm).toBeGreaterThan(0);
    expect(poseFor('hit.stand', 0, BASE).arm).toBe(0);
    expect(poseFor('thrown', 0, BASE).arm).toBe(0);
  });

  test('every canonical action renders a visually distinct pose', () => {
    const seen = new Map<string, string>();
    for (const action of CANONICAL_ACTIONS) {
      const s = poseFor(action.id, 1, BASE);
      const key = `${s.w}|${s.h}|${s.leanX}|${s.color}|${s.arm}`;
      const clash = seen.get(key);
      expect(clash, `${action.id} collides with ${clash}`).toBeUndefined();
      seen.set(key, action.id);
    }
  });

  test('specific collisions reported in review are fixed', () => {
    const shape = (id: string) => JSON.stringify(poseFor(id, 1, BASE));
    expect(shape('run')).not.toBe(shape('dash'));
    expect(shape('hit.air')).not.toBe(shape('fall'));
    expect(shape('air.light')).not.toBe(shape('stand.light')); // air sits at a different height
    expect(shape('stand.light')).not.toBe(shape('stand.heavy'));
    expect(shape('special.air')).not.toBe(shape('air.medium')); // special (orange) vs attack (white)
  });
});
