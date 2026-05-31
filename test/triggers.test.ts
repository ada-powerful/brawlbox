import { describe, expect, test } from 'vitest';
import { evalTrigger, type TriggerCtx } from '../src/engine/triggers.ts';
import type { Character, Trigger } from '../src/engine/schema.ts';
import { Btn, createWorld } from '../src/engine/world.ts';

function makeCharacter(extra: Partial<Character> = {}): Character {
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
    states: {},
    ...extra,
  };
}

function ctx(overrides: Partial<TriggerCtx> = {}): TriggerCtx {
  const world = createWorld();
  const player = world.players[0]!;
  return {
    world,
    player,
    inputs: { players: [{ buttons: 0 }, { buttons: 0 }] },
    playerIndex: 0,
    character: makeCharacter(),
    ...overrides,
  };
}

describe('evalTrigger', () => {
  describe('comparison ops', () => {
    test('eq numbers', () => {
      expect(evalTrigger({ op: 'eq', left: { ref: 'pos.y' }, right: { const: 0 } }, ctx())).toBe(
        true,
      );
    });
    test('ne numbers', () => {
      expect(evalTrigger({ op: 'ne', left: { ref: 'pos.y' }, right: { const: 5 } }, ctx())).toBe(
        true,
      );
    });
    test('lt / le / gt / ge', () => {
      const c = ctx();
      c.player.pos.y = 5;
      expect(evalTrigger({ op: 'lt', left: { ref: 'pos.y' }, right: { const: 10 } }, c)).toBe(true);
      expect(evalTrigger({ op: 'le', left: { ref: 'pos.y' }, right: { const: 5 } }, c)).toBe(true);
      expect(evalTrigger({ op: 'gt', left: { ref: 'pos.y' }, right: { const: 0 } }, c)).toBe(true);
      expect(evalTrigger({ op: 'ge', left: { ref: 'pos.y' }, right: { const: 5 } }, c)).toBe(true);
    });
    test('eq strings (stateNo)', () => {
      expect(
        evalTrigger({ op: 'eq', left: { ref: 'stateNo' }, right: { const: 'stand' } }, ctx()),
      ).toBe(true);
    });
    test('mixed-type compare returns false (no coercion)', () => {
      expect(evalTrigger({ op: 'eq', left: { ref: 'stateNo' }, right: { const: 0 } }, ctx())).toBe(
        false,
      );
    });
  });

  describe('boolean ops', () => {
    test('and short-circuits to false', () => {
      const t: Trigger = {
        op: 'and',
        args: [
          { op: 'eq', left: { const: 1 }, right: { const: 1 } },
          { op: 'eq', left: { const: 1 }, right: { const: 2 } },
        ],
      };
      expect(evalTrigger(t, ctx())).toBe(false);
    });
    test('or returns true if any matches', () => {
      const t: Trigger = {
        op: 'or',
        args: [
          { op: 'eq', left: { const: 1 }, right: { const: 2 } },
          { op: 'eq', left: { const: 1 }, right: { const: 1 } },
        ],
      };
      expect(evalTrigger(t, ctx())).toBe(true);
    });
    test('not negates', () => {
      const t: Trigger = {
        op: 'not',
        arg: { op: 'eq', left: { const: 1 }, right: { const: 1 } },
      };
      expect(evalTrigger(t, ctx())).toBe(false);
    });
    test('nested composition', () => {
      const t: Trigger = {
        op: 'and',
        args: [
          { op: 'eq', left: { const: 1 }, right: { const: 1 } },
          {
            op: 'or',
            args: [
              { op: 'eq', left: { const: 'a' }, right: { const: 'b' } },
              { op: 'not', arg: { op: 'eq', left: { const: 'a' }, right: { const: 'b' } } },
            ],
          },
        ],
      };
      expect(evalTrigger(t, ctx())).toBe(true);
    });
  });

  describe('refs', () => {
    test('time reads stateTime', () => {
      const c = ctx();
      c.player.stateTime = 7;
      expect(evalTrigger({ op: 'eq', left: { ref: 'time' }, right: { const: 7 } }, c)).toBe(true);
    });
    test('vel.x and vel.y', () => {
      const c = ctx();
      c.player.vel.x = -3;
      c.player.vel.y = 9;
      expect(evalTrigger({ op: 'lt', left: { ref: 'vel.x' }, right: { const: 0 } }, c)).toBe(true);
      expect(evalTrigger({ op: 'gt', left: { ref: 'vel.y' }, right: { const: 5 } }, c)).toBe(true);
    });
    test('animTime and animElem read from player', () => {
      const c = ctx();
      c.player.animTime = 4;
      c.player.animFrame = 2;
      expect(evalTrigger({ op: 'eq', left: { ref: 'animTime' }, right: { const: 4 } }, c)).toBe(
        true,
      );
      expect(evalTrigger({ op: 'eq', left: { ref: 'animElem' }, right: { const: 2 } }, c)).toBe(
        true,
      );
    });
  });

  describe('flags', () => {
    test('ctrl reads player.ctrl', () => {
      const c = ctx();
      c.player.ctrl = false;
      expect(evalTrigger({ op: 'flag', name: 'ctrl' }, c)).toBe(false);
      c.player.ctrl = true;
      expect(evalTrigger({ op: 'flag', name: 'ctrl' }, c)).toBe(true);
    });
    test('moveContact / moveHit / moveGuarded default false', () => {
      expect(evalTrigger({ op: 'flag', name: 'moveContact' }, ctx())).toBe(false);
      expect(evalTrigger({ op: 'flag', name: 'moveHit' }, ctx())).toBe(false);
      expect(evalTrigger({ op: 'flag', name: 'moveGuarded' }, ctx())).toBe(false);
    });
  });

  describe('button', () => {
    test('held is true when bit is set', () => {
      const c = ctx({
        inputs: { players: [{ buttons: Btn.Right }, { buttons: 0 }] },
      });
      expect(evalTrigger({ op: 'button', held: 'right' }, c)).toBe(true);
      expect(evalTrigger({ op: 'button', held: 'left' }, c)).toBe(false);
    });
    test('held=false when no input', () => {
      expect(evalTrigger({ op: 'button', held: 'a' }, ctx())).toBe(false);
    });
    test('reads correct player by playerIndex', () => {
      const c = ctx({
        inputs: { players: [{ buttons: 0 }, { buttons: Btn.A }] },
        playerIndex: 1,
      });
      expect(evalTrigger({ op: 'button', held: 'a' }, c)).toBe(true);
    });
  });

  describe('command', () => {
    test('returns false when command not defined on character', () => {
      expect(evalTrigger({ op: 'command', name: 'unknown' }, ctx())).toBe(false);
    });

    test('matches when motion completes at current tick', () => {
      const character = makeCharacter({
        commands: [{ name: 'fireball', motion: 'D, DF, F, x', bufferTicks: 15 }],
      });
      const c = ctx({ character });
      c.player.inputBuffer = [Btn.Down, Btn.Down | Btn.Right, Btn.Right, Btn.Right | Btn.X];
      expect(evalTrigger({ op: 'command', name: 'fireball' }, c)).toBe(true);
    });

    test('does not match if button released before current tick', () => {
      const character = makeCharacter({
        commands: [{ name: 'fireball', motion: 'D, DF, F, x', bufferTicks: 15 }],
      });
      const c = ctx({ character });
      c.player.inputBuffer = [Btn.Down, Btn.Down | Btn.Right, Btn.Right, Btn.Right | Btn.X, 0];
      expect(evalTrigger({ op: 'command', name: 'fireball' }, c)).toBe(false);
    });
  });
});
