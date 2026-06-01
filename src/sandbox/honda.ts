// E. Honda-inspired demo character, built by patching the hand-authored `base`
// moveset with the engine features added across rounds 1–3:
//   - charge specials      ([B]/[D] motions)        → Sumo Headbutt, Sumo Splash
//   - mash special         (x,x,x)                  → Hundred Hand Slap
//   - power-meter super     (charge + power>=1000)   → Super Headbutt
//   - command grab         (HCB motion + Throw)     → Oicho Throw
// It reuses the base sprite atlas (placeholder art) so it renders in the sandbox
// and inherits base's normals, guard states, hit states, and proximity throw.
//
// This is demo/sandbox content, NOT engine code — it builds a plain object and
// runs it through `parseCharacter`, which validates the schema AND every state /
// anim / command reference. If a move is malformed the import throws loudly.
import baseChar from '../../characters/base/character.json' with { type: 'json' };
import {
  parseCharacter,
  type Animation,
  type Character,
  type Controller,
  type HitDef,
  type State,
  type Trigger,
} from '@/engine/schema.ts';

const T = {
  timeEq: (n: number): Trigger => ({ op: 'eq', left: { ref: 'time' }, right: { const: n } }),
  timeLe: (n: number): Trigger => ({ op: 'le', left: { ref: 'time' }, right: { const: n } }),
  timeGe: (n: number): Trigger => ({ op: 'ge', left: { ref: 'time' }, right: { const: n } }),
  cmd: (name: string): Trigger => ({ op: 'command', name }),
  powerGe: (n: number): Trigger => ({ op: 'ge', left: { ref: 'power' }, right: { const: n } }),
  falling: (): Trigger => ({ op: 'lt', left: { ref: 'vel.y' }, right: { const: 0 } }),
  and: (...args: Trigger[]): Trigger => ({ op: 'and', args }),
  // Active frame of an attack animation (matches the convention base uses).
  hitActive: (): Trigger => ({
    op: 'and',
    args: [
      { op: 'eq', left: { ref: 'animElem' }, right: { const: 1 } },
      { op: 'eq', left: { ref: 'animTime' }, right: { const: 0 } },
    ],
  }),
  landed: (): Trigger => ({
    op: 'and',
    args: [
      { op: 'le', left: { ref: 'pos.y' }, right: { const: 0 } },
      { op: 'le', left: { ref: 'vel.y' }, right: { const: 0 } },
      { op: 'gt', left: { ref: 'time' }, right: { const: 0 } },
    ],
  }),
};

function hit(over: Partial<HitDef> = {}): HitDef {
  return {
    attr: { state: 'S', class: 'NA' },
    damage: { hit: 50, guard: 5 },
    hitFlag: 'MAF',
    guardFlag: 'MA',
    pauseTime: { p1: 8, p2: 8 },
    groundHitTime: 12,
    groundVelocity: { x: 4, y: 0 },
    airVelocity: { x: 3, y: 4 },
    priority: 3,
    ...over,
  };
}

const newAnimations: Record<string, Animation> = {
  // Falling body-splash: a persistent hitbox under Honda while he descends.
  'special.splash': {
    loop: false,
    frames: [
      {
        sprite: 'jump-fall',
        duration: -1,
        offset: { x: 0, y: 0 },
        hurtboxes: [{ x: -30, y: 0, w: 60, h: 90 }],
        hitboxes: [{ x: -25, y: 0, w: 55, h: 55 }],
      },
    ],
  },
  // Two-frame looping slap (windup → active) so Hundred Hand Slap re-hits.
  'special.slap': {
    loop: true,
    frames: [
      {
        sprite: 'punch-startup',
        duration: 2,
        offset: { x: 0, y: 0 },
        hurtboxes: [{ x: -30, y: 0, w: 60, h: 100 }],
        hitboxes: [],
      },
      {
        sprite: 'punch-active',
        duration: 2,
        offset: { x: 0, y: 0 },
        hurtboxes: [{ x: -30, y: 0, w: 60, h: 100 }],
        hitboxes: [{ x: 28, y: 50, w: 55, h: 28 }],
      },
    ],
  },
};

const newStates: Record<string, State> = {
  // Sumo Headbutt — charge back, lunge forward. (physics S so it decelerates.)
  headbutt: {
    type: 'S',
    moveType: 'A',
    physics: 'S',
    anim: 'punch',
    ctrl: 0,
    velSet: { x: 0, y: 0 },
    controllers: [
      { type: 'VelSet', xForward: 9, trigger: T.timeEq(0) },
      { type: 'PowerAdd', value: 120, trigger: T.timeEq(0) },
      {
        type: 'HitDef',
        def: hit({
          damage: { hit: 90, guard: 12 },
          groundVelocity: { x: 7, y: 0 },
          airVelocity: { x: 5, y: 5 },
          pauseTime: { p1: 10, p2: 14 },
          priority: 4,
        }),
        trigger: T.hitActive(),
      },
      { type: 'ChangeState', value: 'stand', ctrl: 1, trigger: T.timeGe(26) },
    ],
  },
  // Sumo Splash — charge down, leap up, body-splash on the way down.
  sumoSplash: {
    type: 'A',
    moveType: 'A',
    physics: 'A',
    anim: 'jump.rise',
    ctrl: 0,
    velSet: { x: 0, y: 0 },
    controllers: [
      { type: 'VelSet', xForward: 3, y: 12, trigger: T.timeEq(0) },
      { type: 'PowerAdd', value: 100, trigger: T.timeEq(0) },
      { type: 'ChangeAnim', value: 'special.splash', trigger: T.falling() },
      {
        type: 'HitDef',
        def: hit({
          attr: { state: 'A', class: 'NA' },
          damage: { hit: 80, guard: 10 },
          groundVelocity: { x: 3, y: 0 },
          airVelocity: { x: 3, y: -2 },
          pauseTime: { p1: 10, p2: 14 },
          priority: 4,
        }),
        trigger: T.falling(),
      },
      { type: 'ChangeState', value: 'stand', ctrl: 1, trigger: T.landed() },
    ],
  },
  // Hundred Hand Slap — mash x; loops the slap anim, re-arming the HitDef.
  hundredSlap: {
    type: 'S',
    moveType: 'A',
    physics: 'S',
    anim: 'special.slap',
    ctrl: 0,
    velSet: { x: 0, y: 0 },
    controllers: [
      {
        type: 'HitDef',
        def: hit({
          damage: { hit: 14, guard: 2 },
          groundVelocity: { x: 1, y: 0 },
          airVelocity: { x: 1, y: 2 },
          groundHitTime: 6,
          pauseTime: { p1: 3, p2: 6 },
          priority: 3,
        }),
        trigger: T.hitActive(),
      },
      { type: 'PowerAdd', value: 8, trigger: T.hitActive() },
      { type: 'ChangeState', value: 'stand', ctrl: 1, trigger: T.timeGe(34) },
    ],
  },
  // Super Headbutt — charge + meter. Drains power, big damage/reach.
  superHeadbutt: {
    type: 'S',
    moveType: 'A',
    physics: 'S',
    anim: 'punch',
    ctrl: 0,
    velSet: { x: 0, y: 0 },
    controllers: [
      { type: 'PowerSet', value: 0, trigger: T.timeEq(0) },
      { type: 'VelSet', xForward: 13, trigger: T.timeEq(0) },
      {
        type: 'HitDef',
        def: hit({
          damage: { hit: 200, guard: 25 },
          groundVelocity: { x: 9, y: 3 },
          airVelocity: { x: 7, y: 6 },
          pauseTime: { p1: 14, p2: 24 },
          priority: 6,
        }),
        trigger: T.hitActive(),
      },
      { type: 'ChangeState', value: 'stand', ctrl: 1, trigger: T.timeGe(34) },
    ],
  },
  // Oicho Throw — HCB command grab via the Throw subsystem.
  oicho: {
    type: 'S',
    moveType: 'A',
    physics: 'N',
    anim: 'punch',
    ctrl: 0,
    velSet: { x: 0, y: 0 },
    controllers: [
      {
        type: 'Throw',
        def: {
          range: { x: 80, y: 50 },
          damage: 130,
          attackerState: 'oicho.exec',
          releaseState: 'hit.air',
          bindTime: 20,
          bindPos: { x: 50, y: 0 },
          throwVel: { x: 7, y: 9 },
        },
        trigger: T.timeLe(3),
      },
      { type: 'PowerAdd', value: 100, trigger: T.timeEq(0) },
      { type: 'ChangeState', value: 'stand', ctrl: 1, trigger: T.timeGe(16) },
    ],
  },
  'oicho.exec': {
    type: 'S',
    moveType: 'A',
    physics: 'N',
    anim: 'punch',
    ctrl: 0,
    velSet: { x: 0, y: 0 },
    controllers: [{ type: 'ChangeState', value: 'stand', ctrl: 1, trigger: T.timeGe(24) }],
  },
};

// Special-move entries to prepend to `stand` (highest priority first). The super
// is checked before the plain headbutt and gated on meter, so x+z with a full
// bar supers and otherwise falls through to the headbutt.
const standSpecials: Controller[] = [
  {
    type: 'ChangeState',
    value: 'superHeadbutt',
    trigger: T.and(T.cmd('superheadbutt'), T.powerGe(1000)),
  },
  { type: 'ChangeState', value: 'headbutt', trigger: T.cmd('headbutt') },
  { type: 'ChangeState', value: 'sumoSplash', trigger: T.cmd('splash') },
  { type: 'ChangeState', value: 'oicho', trigger: T.cmd('oicho') },
  { type: 'ChangeState', value: 'hundredSlap', trigger: T.cmd('slap') },
];

const newCommands = [
  { name: 'superheadbutt', motion: '[B]45,F,x+z', bufferTicks: 14 },
  { name: 'headbutt', motion: '[B]35,F,x', bufferTicks: 14 },
  { name: 'splash', motion: '[D]35,U,a', bufferTicks: 14 },
  { name: 'slap', motion: 'x,x,x', bufferTicks: 12 },
  { name: 'oicho', motion: '~F,DF,D,DB,B,b', bufferTicks: 24 },
];

// Loose view of the cloned base used only for the merge below.
interface RawChar {
  meta: Record<string, string>;
  animations: Record<string, unknown>;
  states: Record<string, unknown>;
  commands: unknown[];
}

function buildHonda(): Character {
  const c = structuredClone(baseChar) as unknown as RawChar;
  c.meta = { id: 'honda', name: 'E. Honda (engine demo)', author: 'BrawlBox', version: '0.1.0' };

  for (const [k, v] of Object.entries(newAnimations)) c.animations[k] = v;
  for (const [k, v] of Object.entries(newStates)) c.states[k] = v;
  c.commands = [...c.commands, ...newCommands];

  // Build power on heavy normals so the meter is reachable in a real match.
  for (const id of ['standHP', 'standHK', 'crouchHK']) {
    const st = c.states[id] as { controllers: unknown[] } | undefined;
    if (st) st.controllers = [{ type: 'PowerAdd', value: 30, trigger: T.timeEq(0) }, ...st.controllers];
  }

  // Specials are cancel-priority over normals: prepend them to stand.
  const stand = c.states['stand'] as { controllers: unknown[] };
  stand.controllers = [...standSpecials, ...stand.controllers];

  return parseCharacter(c);
}

export const HONDA_CHARACTER: Character = buildHonda();
