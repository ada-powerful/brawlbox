import type { Trigger, Value } from './schema.ts';
import type { Inputs, Player, World } from './world.ts';
import { Btn } from './world.ts';

export interface TriggerCtx {
  world: World;
  player: Player;
  inputs: Inputs;
  playerIndex: number;
  moveContact?: boolean;
  moveHit?: boolean;
  moveGuarded?: boolean;
}

const BUTTON_BIT: Record<string, number> = {
  up: Btn.Up,
  down: Btn.Down,
  left: Btn.Left,
  right: Btn.Right,
  a: Btn.A,
  b: Btn.B,
  c: Btn.C,
  x: Btn.X,
  y: Btn.Y,
  z: Btn.Z,
};

export function evalTrigger(trig: Trigger, ctx: TriggerCtx): boolean {
  switch (trig.op) {
    case 'and':
      return trig.args.every((a) => evalTrigger(a, ctx));
    case 'or':
      return trig.args.some((a) => evalTrigger(a, ctx));
    case 'not':
      return !evalTrigger(trig.arg, ctx);
    case 'eq':
    case 'ne':
    case 'lt':
    case 'le':
    case 'gt':
    case 'ge':
      return compare(trig.op, evalValue(trig.left, ctx), evalValue(trig.right, ctx));
    case 'flag':
      return evalFlag(trig.name, ctx);
    case 'button':
      return evalButton(trig.held, ctx);
    case 'command':
      return false;
  }
}

function compare(
  op: 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge',
  a: number | string | boolean,
  b: number | string | boolean,
): boolean {
  if (typeof a !== typeof b) return false;
  switch (op) {
    case 'eq':
      return a === b;
    case 'ne':
      return a !== b;
    case 'lt':
      return a < b;
    case 'le':
      return a <= b;
    case 'gt':
      return a > b;
    case 'ge':
      return a >= b;
  }
}

function evalValue(v: Value, ctx: TriggerCtx): number | string | boolean {
  if ('const' in v) return v.const;
  switch (v.ref) {
    case 'time':
      return ctx.player.stateTime;
    case 'stateNo':
      return ctx.player.stateId;
    case 'animTime':
      return ctx.player.animTime;
    case 'animElem':
      return ctx.player.animFrame;
    case 'vel.x':
      return ctx.player.vel.x;
    case 'vel.y':
      return ctx.player.vel.y;
    case 'pos.x':
      return ctx.player.pos.x;
    case 'pos.y':
      return ctx.player.pos.y;
    case 'life':
      return 1000;
  }
}

function evalFlag(
  name: 'ctrl' | 'moveContact' | 'moveHit' | 'moveGuarded',
  ctx: TriggerCtx,
): boolean {
  switch (name) {
    case 'ctrl':
      return ctx.player.ctrl;
    case 'moveContact':
      return ctx.moveContact ?? false;
    case 'moveHit':
      return ctx.moveHit ?? false;
    case 'moveGuarded':
      return ctx.moveGuarded ?? false;
  }
}

function evalButton(name: string, ctx: TriggerCtx): boolean {
  const inp = ctx.inputs.players[ctx.playerIndex];
  if (!inp) return false;
  const bit = BUTTON_BIT[name];
  if (bit === undefined) return false;
  return (inp.buttons & bit) !== 0;
}
