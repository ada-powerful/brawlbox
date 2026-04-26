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
        | 'life';
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

export type AABB = z.infer<typeof AABBSchema>;
export type FrameRect = z.infer<typeof FrameRectSchema>;
export type AnimFrame = z.infer<typeof AnimFrameSchema>;
export type Animation = z.infer<typeof AnimationSchema>;

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
    y: z.number().optional(),
    trigger: TriggerSchema,
  }),
  z.object({
    type: z.literal('VelAdd'),
    x: z.number().optional(),
    y: z.number().optional(),
    trigger: TriggerSchema,
  }),
  z.object({
    type: z.literal('CtrlSet'),
    value: z.union([z.literal(0), z.literal(1)]),
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
  ControllerSchema,
  FrameRectSchema,
  StateSchema,
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
    }
  }
}
