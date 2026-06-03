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

    test('life reads real player.life', () => {
      const c = ctx();
      c.player.life = 742;
      expect(evalTrigger({ op: 'eq', left: { ref: 'life' }, right: { const: 742 } }, c)).toBe(true);
      expect(evalTrigger({ op: 'eq', left: { ref: 'life' }, right: { const: 1000 } }, c)).toBe(
        false,
      );
    });

    test('power reads player.power', () => {
      const c = ctx();
      c.player.power = 1500;
      expect(evalTrigger({ op: 'eq', left: { ref: 'power' }, right: { const: 1500 } }, c)).toBe(
        true,
      );
    });
  });

  describe('opponent refs', () => {
    test('p2Dist.x is positive when opponent is in front and flips with facing', () => {
      const world = createWorld();
      const p1 = world.players[0]!;
      const p2 = world.players[1]!;
      p1.pos.x = 300;
      p2.pos.x = 500; // opponent 200 to the right
      const c = ctx({ world, player: p1, playerIndex: 0 });

      p1.facing = 1; // facing right, opponent in front
      expect(evalTrigger({ op: 'eq', left: { ref: 'p2Dist.x' }, right: { const: 200 } }, c)).toBe(
        true,
      );

      p1.facing = -1; // facing left, opponent behind -> negative
      expect(evalTrigger({ op: 'eq', left: { ref: 'p2Dist.x' }, right: { const: -200 } }, c)).toBe(
        true,
      );
    });

    test('p2BodyDist subtracts both half-widths', () => {
      const world = createWorld();
      const p1 = world.players[0]!;
      const p2 = world.players[1]!;
      p1.pos.x = 300;
      p2.pos.x = 500; // center gap 200
      p1.halfWidth = 30;
      p2.halfWidth = 30; // 200 - 30 - 30 = 140
      const c = ctx({ world, player: p1, playerIndex: 0 });
      expect(evalTrigger({ op: 'eq', left: { ref: 'p2BodyDist' }, right: { const: 140 } }, c)).toBe(
        true,
      );
    });

    test('p2.life / p2.pos.y / p2.stateNo read the opponent', () => {
      const world = createWorld();
      const p1 = world.players[0]!;
      const p2 = world.players[1]!;
      p2.life = 333;
      p2.pos.y = 88;
      p2.stateId = 'jump';
      const c = ctx({ world, player: p1, playerIndex: 0 });
      expect(evalTrigger({ op: 'eq', left: { ref: 'p2.life' }, right: { const: 333 } }, c)).toBe(
        true,
      );
      expect(evalTrigger({ op: 'eq', left: { ref: 'p2.pos.y' }, right: { const: 88 } }, c)).toBe(
        true,
      );
      expect(
        evalTrigger({ op: 'eq', left: { ref: 'p2.stateNo' }, right: { const: 'jump' } }, c),
      ).toBe(true);
    });

    test('neutral values when no opponent exists', () => {
      const world = createWorld();
      const p1 = world.players[0]!;
      // single-player world: drop the opponent
      world.players.length = 1;
      const c = ctx({ world, player: p1, playerIndex: 0 });
      expect(evalTrigger({ op: 'eq', left: { ref: 'p2.life' }, right: { const: 0 } }, c)).toBe(
        true,
      );
      expect(evalTrigger({ op: 'eq', left: { ref: 'p2Dist.x' }, right: { const: 0 } }, c)).toBe(
        true,
      );
      expect(evalTrigger({ op: 'eq', left: { ref: 'p2.stateNo' }, right: { const: '' } }, c)).toBe(
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
