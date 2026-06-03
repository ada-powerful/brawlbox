import { describe, expect, test } from 'vitest';
import { parseCharacter } from '../src/engine/schema.ts';
import baseChar from '../characters/base/character.json' with { type: 'json' };

describe('parseCharacter', () => {
  test('accepts the base character', () => {
    const c = parseCharacter(baseChar);
    expect(c.meta.id).toBe('base');
    expect(Object.keys(c.states)).toEqual(expect.arrayContaining(['stand', 'walk', 'jump']));
  });

  test('base character ships dash + crouch states and the dash command', () => {
    const c = parseCharacter(baseChar);
    expect(Object.keys(c.states)).toEqual(expect.arrayContaining(['dash', 'crouch']));
    expect(Object.keys(c.animations ?? {})).toEqual(expect.arrayContaining(['dash', 'crouch']));
    expect(c.commands?.some((cmd) => cmd.name === 'dash' && cmd.motion === 'F,F')).toBe(true);
  });

  test('accepts VelSet/VelAdd with xForward (facing-relative velocity)', () => {
    const c = parseCharacter({
      ...(baseChar as object),
      states: {
        ...(baseChar as { states: Record<string, unknown> }).states,
        zoom: {
          type: 'S',
          moveType: 'I',
          physics: 'N',
          controllers: [
            {
              type: 'VelSet',
              xForward: 8,
              trigger: { op: 'eq', left: { ref: 'time' }, right: { const: 0 } },
            },
            { type: 'VelAdd', xForward: 2, trigger: { op: 'flag', name: 'ctrl' } },
          ],
        },
      },
    });
    const zoom = c.states.zoom!;
    expect(zoom.controllers[0]).toMatchObject({ type: 'VelSet', xForward: 8 });
    expect(zoom.controllers[1]).toMatchObject({ type: 'VelAdd', xForward: 2 });
  });

  test('rejects character missing required fields', () => {
    expect(() => parseCharacter({ meta: { id: 'x' } })).toThrow();
  });

  test('rejects ChangeState referencing unknown state', () => {
    const bad = {
      ...(baseChar as object),
      states: {
        ...(baseChar as { states: Record<string, unknown> }).states,
        stand: {
          type: 'S',
          moveType: 'I',
          physics: 'S',
          controllers: [
            {
              type: 'ChangeState',
              value: 'doesNotExist',
              trigger: { op: 'button', held: 'right' },
            },
          ],
        },
      },
    };
    expect(() => parseCharacter(bad)).toThrow(/unknown state "doesNotExist"/);
  });

  test('rejects gravity outside bounds (negative)', () => {
    const bad = {
      ...(baseChar as object),
      data: { ...(baseChar as { data: object }).data, gravity: -1 },
    };
    expect(() => parseCharacter(bad)).toThrow();
  });

  test('rejects controllers with invalid trigger op', () => {
    const bad = {
      ...(baseChar as object),
      states: {
        ...(baseChar as { states: Record<string, unknown> }).states,
        bogus: {
          type: 'S',
          moveType: 'I',
          physics: 'S',
          controllers: [
            {
              type: 'VelSet',
              x: 0,
              trigger: { op: 'unknownOp' },
            },
          ],
        },
      },
    };
    expect(() => parseCharacter(bad)).toThrow();
  });
});
