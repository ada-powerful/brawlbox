import { z } from 'zod';

export type Value =
  | { const: number | string | boolean }
  | {
      ref:
        | 'time'
        | 'animTime'
        | 'animElem'
        | 'stateNo'
        | 'vel.x'
        | 'vel.y'
        | 'pos.x'
        | 'pos.y'
        | 'life'
        | 'power'
        | 'p2BodyDist'
        | 'p2Dist.x'
        | 'p2.pos.y'
        | 'p2.life'
        | 'p2.stateNo';
    };

export type Trigger =
  | { op: 'and' | 'or'; args: Trigger[] }
  | { op: 'not'; arg: Trigger }
  | { op: 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge'; left: Value; right: Value }
  | { op: 'flag'; name: 'ctrl' | 'moveContact' | 'moveHit' | 'moveGuarded' }
  | {
      op: 'button';
      held: 'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'c' | 'x' | 'y' | 'z';
    }
  | { op: 'command'; name: string };

const ValueSchema: z.ZodType<Value> = z.union([
  z.object({ const: z.union([z.number(), z.string(), z.boolean()]) }),
  z.object({
    ref: z.enum([
      'time',
      'animTime',
      'animElem',
      'stateNo',
      'vel.x',
      'vel.y',
      'pos.x',
      'pos.y',
      'life',
      'power',
      'p2BodyDist',
      'p2Dist.x',
      'p2.pos.y',
      'p2.life',
      'p2.stateNo',
    ]),
  }),
]);

const TriggerSchema: z.ZodType<Trigger> = z.lazy(() =>
  z.union([
    z.object({ op: z.enum(['and', 'or']), args: z.array(TriggerSchema) }),
    z.object({ op: z.literal('not'), arg: TriggerSchema }),
    z.object({
      op: z.enum(['eq', 'ne', 'lt', 'le', 'gt', 'ge']),
      left: ValueSchema,
      right: ValueSchema,
    }),
    z.object({
      op: z.literal('flag'),
      name: z.enum(['ctrl', 'moveContact', 'moveHit', 'moveGuarded']),
    }),
    z.object({
      op: z.literal('button'),
      held: z.enum(['up', 'down', 'left', 'right', 'a', 'b', 'c', 'x', 'y', 'z']),
    }),
    z.object({
      op: z.literal('command'),
      name: z.string().min(1),
    }),
  ]),
);

const Vec2Schema = z.object({ x: z.number(), y: z.number() });
const Vec2PartialSchema = z.object({ x: z.number().optional(), y: z.number().optional() });

const AABBSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().nonnegative(),
  h: z.number().nonnegative(),
});

const FrameRectSchema = z.object({
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  w: z.number().positive(),
  h: z.number().positive(),
});

const AnimFrameSchema = z.object({
  sprite: z.string().min(1),
  duration: z.number().int(),
  offset: z.object({ x: z.number(), y: z.number() }).default({ x: 0, y: 0 }),
  hurtboxes: z.array(AABBSchema).default([]),
  hitboxes: z.array(AABBSchema).default([]),
});

const AnimationSchema = z.object({
  loop: z.boolean(),
  frames: z.array(AnimFrameSchema).min(1),
});

const CommandSchema = z.object({
  name: z.string().min(1),
  motion: z.string().min(1),
  bufferTicks: z.number().int().positive().default(15),
});

const HitDefSchema = z.object({
  attr: z.object({
    state: z.enum(['S', 'C', 'A']),
    class: z.enum(['NA', 'SA', 'HA', 'NT', 'ST', 'HT']),
  }),
  damage: z.object({
    hit: z.number().nonnegative(),
    guard: z.number().nonnegative(),
  }),
  hitFlag: z.string(),
  guardFlag: z.string(),
  pauseTime: z.object({
    p1: z.number().int().nonnegative(),
    p2: z.number().int().nonnegative(),
  }),
  groundHitTime: z.number().int().nonnegative(),
  groundVelocity: Vec2Schema,
  airVelocity: Vec2Schema,
  // Pushback applied to a victim who BLOCKS this hit (x is facing-relative, like
  // groundVelocity). Optional; defaults to a scaled groundVelocity at runtime.
  guardVelocity: Vec2Schema.optional(),
  priority: z.number().int(),
  fall: z.boolean().optional(),
  sound: z.string().optional(),
});

// A throw is range-based, not hitbox-based: the attacker arms a grab and, if a
// grabbable victim is within `range` (edge-to-edge body distance on x, height on
// y), the victim is BOUND to the attacker for `bindTime` ticks at `bindPos`
// (facing-relative offset), then released with `throwVel` into `releaseState`.
// `attackerState` is the attacker's own throw-animation state. `releaseState` is
// a state in the VICTIM's character (defaults to 'hit.air'; runtime falls back).
const ThrowDefSchema = z.object({
  range: z.object({ x: z.number().nonnegative(), y: z.number().nonnegative() }),
  damage: z.number().nonnegative(),
  attackerState: z.string().min(1),
  releaseState: z.string().min(1).default('hit.air'),
  bindTime: z.number().int().nonnegative(),
  bindPos: Vec2Schema,
  throwVel: Vec2Schema,
});

export type AABB = z.infer<typeof AABBSchema>;
export type FrameRect = z.infer<typeof FrameRectSchema>;
export type AnimFrame = z.infer<typeof AnimFrameSchema>;
export type Animation = z.infer<typeof AnimationSchema>;
export type Command = z.infer<typeof CommandSchema>;
export type HitDef = z.infer<typeof HitDefSchema>;
export type ThrowDef = z.infer<typeof ThrowDefSchema>;

const ControllerSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ChangeState'),
    value: z.string().min(1),
    ctrl: z.union([z.literal(0), z.literal(1)]).optional(),
    trigger: TriggerSchema,
  }),
  z.object({
    type: z.literal('ChangeAnim'),
    value: z.string().min(1),
    trigger: TriggerSchema,
  }),
  z.object({
    type: z.literal('VelSet'),
    x: z.number().optional(),
    // Facing-relative horizontal velocity: vel.x = xForward * facing. Mirrors
    // the HitDef.groundVelocity.x convention so movement reads "forward" not "right".
    xForward: z.number().optional(),
    y: z.number().optional(),
    trigger: TriggerSchema,
  }),
  z.object({
    type: z.literal('VelAdd'),
    x: z.number().optional(),
    xForward: z.number().optional(),
    y: z.number().optional(),
    trigger: TriggerSchema,
  }),
  z.object({
    type: z.literal('CtrlSet'),
    value: z.union([z.literal(0), z.literal(1)]),
    trigger: TriggerSchema,
  }),
  z.object({
    type: z.literal('HitDef'),
    def: HitDefSchema,
    trigger: TriggerSchema,
  }),
  z.object({
    type: z.literal('PowerAdd'),
    value: z.number(),
    trigger: TriggerSchema,
  }),
  z.object({
    type: z.literal('PowerSet'),
    value: z.number(),
    trigger: TriggerSchema,
  }),
  z.object({
    type: z.literal('Throw'),
    def: ThrowDefSchema,
    trigger: TriggerSchema,
  }),
]);

export type Controller = z.infer<typeof ControllerSchema>;

const StateSchema = z.object({
  type: z.enum(['S', 'C', 'A', 'L']),
  moveType: z.enum(['A', 'I', 'H']),
  physics: z.enum(['S', 'C', 'A', 'N']),
  anim: z.string().optional(),
  velSet: Vec2PartialSchema.optional(),
  ctrl: z.union([z.literal(0), z.literal(1)]).optional(),
  controllers: z.array(ControllerSchema),
});

export type State = z.infer<typeof StateSchema>;

const CharacterSchema = z.object({
  meta: z.object({
    id: z.string().min(1),
    name: z.string(),
    author: z.string(),
    version: z.string(),
  }),
  data: z.object({
    life: z.number().positive(),
    attack: z.number(),
    defence: z.number(),
    walkFwd: z.number(),
    walkBack: z.number(),
    jumpVel: Vec2Schema,
    gravity: z.number().nonnegative(),
    groundFriction: z.number().min(0).max(1),
  }),
  size: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    headY: z.number(),
  }),
  states: z.record(z.string().min(1), StateSchema),
  animations: z.record(z.string().min(1), AnimationSchema).optional(),
  commands: z.array(CommandSchema).optional(),
  spriteAtlas: z
    .object({
      url: z.string(),
      frames: z.record(z.string().min(1), FrameRectSchema),
    })
    .optional(),
});

export type Character = z.infer<typeof CharacterSchema>;

export {
  AABBSchema,
  AnimationSchema,
  AnimFrameSchema,
  CharacterSchema,
  CommandSchema,
  ControllerSchema,
  FrameRectSchema,
  HitDefSchema,
  StateSchema,
  ThrowDefSchema,
  TriggerSchema,
  ValueSchema,
};

export function parseCharacter(json: unknown): Character {
  const c = CharacterSchema.parse(json);
  validateReferences(c);
  return c;
}

function validateReferences(c: Character): void {
  const knownStates = new Set(Object.keys(c.states));
  const knownAnims = new Set(Object.keys(c.animations ?? {}));
  const knownCommands = new Set((c.commands ?? []).map((cmd) => cmd.name));

  for (const [stateId, state] of Object.entries(c.states)) {
    if (state.anim !== undefined && !knownAnims.has(state.anim)) {
      throw new Error(
        `Character "${c.meta.id}": state "${stateId}" references unknown animation "${state.anim}"`,
      );
    }
    for (const ctrl of state.controllers) {
      if (ctrl.type === 'ChangeState' && !knownStates.has(ctrl.value)) {
        throw new Error(
          `Character "${c.meta.id}": state "${stateId}" has ChangeState to unknown state "${ctrl.value}"`,
        );
      }
      if (ctrl.type === 'ChangeAnim' && !knownAnims.has(ctrl.value)) {
        throw new Error(
          `Character "${c.meta.id}": state "${stateId}" has ChangeAnim to unknown animation "${ctrl.value}"`,
        );
      }
      // A Throw's attackerState is in this character; releaseState is a victim
      // state (validated at runtime against the victim, with a fallback).
      if (ctrl.type === 'Throw' && !knownStates.has(ctrl.def.attackerState)) {
        throw new Error(
          `Character "${c.meta.id}": state "${stateId}" has Throw to unknown attackerState "${ctrl.def.attackerState}"`,
        );
      }
      checkCommandRefs(ctrl.trigger, knownCommands, c.meta.id, stateId);
    }
  }
}

function checkCommandRefs(
  trig: Trigger,
  known: Set<string>,
  charId: string,
  stateId: string,
): void {
  switch (trig.op) {
    case 'command':
      if (!known.has(trig.name)) {
        throw new Error(
          `Character "${charId}": state "${stateId}" trigger references unknown command "${trig.name}"`,
        );
      }
      return;
    case 'and':
    case 'or':
      for (const a of trig.args) checkCommandRefs(a, known, charId, stateId);
      return;
    case 'not':
      checkCommandRefs(trig.arg, known, charId, stateId);
      return;
    default:
      return;
  }
}
