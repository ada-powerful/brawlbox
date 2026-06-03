import { matchMotion, parseMotion, type ParsedMotion } from './commands.ts';
import type { Character, Trigger, Value } from './schema.ts';
import type { Inputs, Player, World } from './world.ts';
import { Btn } from './world.ts';

export interface TriggerCtx {
  world: World;
  player: Player;
  inputs: Inputs;
  playerIndex: number;
  character: Character;
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
      return evalCommand(trig.name, ctx);
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
      return ctx.player.life;
    case 'power':
      return ctx.player.power;
    case 'p2BodyDist': {
      const opp = findOpponent(ctx);
      if (!opp) return 0;
      return Math.abs(ctx.player.pos.x - opp.pos.x) - ctx.player.halfWidth - opp.halfWidth;
    }
    case 'p2Dist.x': {
      const opp = findOpponent(ctx);
      if (!opp) return 0;
      return (opp.pos.x - ctx.player.pos.x) * ctx.player.facing;
    }
    case 'p2.pos.y': {
      const opp = findOpponent(ctx);
      if (!opp) return 0;
      return opp.pos.y;
    }
    case 'p2.life': {
      const opp = findOpponent(ctx);
      if (!opp) return 0;
      return opp.life;
    }
    case 'p2.stateNo': {
      const opp = findOpponent(ctx);
      if (!opp) return '';
      return opp.stateId;
    }
  }
}

/** First non-null player whose index differs from the self player index. */
function findOpponent(ctx: TriggerCtx): Player | undefined {
  const players = ctx.world.players;
  for (let i = 0; i < players.length; i++) {
    if (i === ctx.playerIndex) continue;
    const p = players[i];
    if (p) return p;
  }
  return undefined;
}

function evalFlag(
  name: 'ctrl' | 'moveContact' | 'moveHit' | 'moveGuarded',
  ctx: TriggerCtx,
): boolean {
  switch (name) {
    case 'ctrl':
      return ctx.player.ctrl;
    case 'moveContact':
      return ctx.player.moveHit || ctx.player.moveGuarded;
    case 'moveHit':
      return ctx.player.moveHit;
    case 'moveGuarded':
      return ctx.player.moveGuarded;
  }
}

function evalButton(name: string, ctx: TriggerCtx): boolean {
  const inp = ctx.inputs.players[ctx.playerIndex];
  if (!inp) return false;
  const bit = BUTTON_BIT[name];
  if (bit === undefined) return false;
  return (inp.buttons & bit) !== 0;
}

const motionCache = new WeakMap<Character, Map<string, ParsedMotion | null>>();

function getParsedMotion(character: Character, name: string): ParsedMotion | null {
  let chMap = motionCache.get(character);
  if (!chMap) {
    chMap = new Map();
    motionCache.set(character, chMap);
  }
  if (chMap.has(name)) return chMap.get(name) ?? null;
  const cmd = character.commands?.find((c) => c.name === name);
  if (!cmd) {
    chMap.set(name, null);
    return null;
  }
  try {
    const parsed = parseMotion(cmd.motion);
    chMap.set(name, parsed);
    return parsed;
  } catch {
    chMap.set(name, null);
    return null;
  }
}

function evalCommand(name: string, ctx: TriggerCtx): boolean {
  const cmd = ctx.character.commands?.find((c) => c.name === name);
  if (!cmd) return false;
  const motion = getParsedMotion(ctx.character, name);
  if (!motion) return false;
  return matchMotion(motion, ctx.player.inputBuffer, ctx.player.facing, cmd.bufferTicks);
}
