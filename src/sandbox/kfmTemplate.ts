// The MUGEN action-sheet template character. It reuses `base`'s (proven) state
// machine, data, and size, but its ANIMATIONS reference the per-action sprite
// keys that DEFAULT_TEMPLATE_MANIFEST maps onto the KFM reference sheet's rows.
// `bakeFromSheet` slices the sheet by those keys, so the baked character shows
// the right frames per action. This is the reusable "character template": any
// sheet with the same row layout slots straight in.
//
// Row → action mapping (see templateManifest.ts for the frame-level detail):
//   0 idle · 1 walk · 2 light jump · 3 high jump · 4 dash · 5 guard
//   6 punch (stand+crouch) · 7 kick (stand/crouch/jump-attack/charged) · 8 charged punch
//   9 hit (stand+crouch) · 10 knockdown+getup · 11 lying/OTG
import baseChar from '../../characters/base/character.json' with { type: 'json' };
import {
  parseCharacter,
  type AABB,
  type Animation,
  type Character,
  type HitDef,
  type Trigger,
} from '@/engine/schema.ts';

const HB = (x: number, y: number, w: number, h: number): AABB => ({ x, y, w, h });

interface FrameSpec {
  s: string;
  d: number;
  hit?: AABB[];
}

function anim(loop: boolean, frames: FrameSpec[]): Animation {
  return {
    loop,
    frames: frames.map((f) => ({
      sprite: f.s,
      duration: f.d,
      offset: { x: 0, y: 0 },
      // Hurtboxes are overwritten by bakeFromSheet with the sprite's alpha box;
      // hitboxes are authored and preserved.
      hurtboxes: [],
      hitboxes: f.hit ?? [],
    })),
  };
}

// Animation ids here cover every id base's states reference (so the cloned state
// machine resolves) plus showcase-only actions surfaced in the gallery.
const KFM_ANIMATIONS: Record<string, Animation> = {
  // Movement
  stand: anim(false, [{ s: 'stand', d: -1 }]),
  // Victory pose — the sheet has no dedicated win row, so reuse the idle pose.
  win: anim(false, [{ s: 'stand', d: -1 }]),
  walk: anim(true, [
    { s: 'walk-0', d: 6 },
    { s: 'walk-1', d: 6 },
    { s: 'walk-2', d: 6 },
    { s: 'walk-3', d: 6 },
  ]),
  dash: anim(false, [
    { s: 'dash-0', d: 6 },
    { s: 'dash-1', d: 6 },
  ]),
  crouch: anim(false, [{ s: 'guard-crouch', d: -1 }]),
  'jump.rise': anim(false, [{ s: 'jump-rise', d: -1 }]),
  'jump.fall': anim(false, [{ s: 'jump-fall', d: -1 }]),
  'highjump.rise': anim(false, [{ s: 'highjump-rise', d: -1 }]),
  'highjump.fall': anim(false, [{ s: 'highjump-fall', d: -1 }]),

  // Standing punch (light/heavy share art; only damage differs in their states)
  punch: anim(false, [
    { s: 'punch-startup', d: 4 },
    { s: 'punch-active', d: 4, hit: [HB(30, 55, 55, 28)] },
    { s: 'punch-recovery', d: 6 },
  ]),
  standLP: anim(false, [
    { s: 'punch-startup', d: 3 },
    { s: 'punch-active', d: 3, hit: [HB(30, 55, 50, 26)] },
    { s: 'punch-recovery', d: 4 },
  ]),
  standHP: anim(false, [
    { s: 'punch-startup', d: 6 },
    { s: 'punch-active', d: 5, hit: [HB(30, 52, 62, 32)] },
    { s: 'punch-recovery', d: 9 },
  ]),

  // Standing kick (row 7)
  standLK: anim(false, [
    { s: 'kick-startup', d: 4 },
    { s: 'kick-active', d: 3, hit: [HB(32, 40, 58, 28)] },
    { s: 'kick-recovery', d: 5 },
  ]),
  standHK: anim(false, [
    { s: 'kick-startup', d: 7 },
    { s: 'kick-active', d: 4, hit: [HB(32, 38, 70, 34)] },
    { s: 'kick-recovery', d: 10 },
  ]),

  // Crouch attacks (row 6 crouch punch, row 7 crouch kick)
  crouchLP: anim(false, [
    { s: 'crouchpunch-active', d: 3 },
    { s: 'crouchpunch-active', d: 3, hit: [HB(28, 22, 45, 22)] },
    { s: 'crouchpunch-active', d: 4 },
  ]),
  crouchHK: anim(false, [
    { s: 'crouchkick-startup', d: 6 },
    { s: 'crouchkick-active', d: 4, hit: [HB(30, 8, 68, 24)] },
    { s: 'crouchkick-recovery', d: 9 },
  ]),
  // Crouch heavy punch = same crouch-punch art as LP, but slower (longer frames).
  crouchHP: anim(false, [
    { s: 'crouchpunch-active', d: 5 },
    { s: 'crouchpunch-active', d: 5, hit: [HB(28, 20, 55, 26)] },
    { s: 'crouchpunch-active', d: 9 },
  ]),
  // Crouch light kick = same crouch-kick art as HK, but faster (shorter frames).
  crouchLK: anim(false, [
    { s: 'crouchkick-startup', d: 3 },
    { s: 'crouchkick-active', d: 3, hit: [HB(30, 8, 58, 22)] },
    { s: 'crouchkick-recovery', d: 5 },
  ]),

  // Jump attack (row 7 frames 6-7)
  jumpLP: anim(false, [{ s: 'jumpattack', d: -1, hit: [HB(25, 40, 48, 30)] }]),

  // Charged moves (held button) — charged punch (row 8), charged kick (row 7 tail)
  punchcharge: anim(false, [
    { s: 'punchcharge-startup', d: 6 },
    { s: 'punchcharge-active', d: 5, hit: [HB(30, 50, 78, 40)] },
    { s: 'punchcharge-recovery', d: 10 },
  ]),
  kickcharge: anim(false, [
    { s: 'kickcharge-startup', d: 5 }, // first frame — the slash effect
    { s: 'kickcharge-active', d: 5, hit: [HB(34, 38, 86, 42)] },
    { s: 'kickcharge-recovery', d: 8 },
  ]),

  // Defense (row 5)
  'guard.stand': anim(false, [{ s: 'guard-stand', d: -1 }]),
  'guard.crouch': anim(false, [{ s: 'guard-crouch', d: -1 }]),
  'guard.air': anim(false, [{ s: 'guard-stand', d: -1 }]),

  // Hurt (row 9)
  'hit.stand': anim(false, [{ s: 'hit-stand', d: -1 }]),
  'hit.crouch': anim(false, [{ s: 'hit-crouch', d: -1 }]),
  'hit.air': anim(false, [{ s: 'launch', d: -1 }]),

  // Knockdown / getup / lying (rows 10-11)
  knockdown: anim(false, [
    { s: 'knockdown', d: 8 },
    { s: 'lying', d: -1 }, // settle into the on-ground (OTG) pose
  ]),
  getup: anim(false, [{ s: 'getup', d: -1 }]),
  thrown: anim(false, [{ s: 'knockdown', d: -1 }]),
  downed: anim(false, [{ s: 'downed', d: -1 }]),
  // KO: tumble in the air (ko.fall), then settle flat on landing (ko).
  'ko.fall': anim(false, [{ s: 'knockdown', d: -1 }]),
  ko: anim(false, [{ s: 'lying-flat', d: -1 }]),
};

// --- Trigger + state helpers for the gameplay patches below ---
const ge = (ref: string, n: number): Trigger => ({
  op: 'ge',
  left: { ref } as never,
  right: { const: n },
});
const lt = (ref: string, n: number): Trigger => ({
  op: 'lt',
  left: { ref } as never,
  right: { const: n },
});
const le = (ref: string, n: number): Trigger => ({
  op: 'le',
  left: { ref } as never,
  right: { const: n },
});
const eq = (ref: string, n: number): Trigger => ({
  op: 'eq',
  left: { ref } as never,
  right: { const: n },
});
const btn = (b: string): Trigger => ({ op: 'button', held: b as never });
const cmd = (name: string): Trigger => ({ op: 'command', name });
const and = (...args: Trigger[]): Trigger => ({ op: 'and', args });
const or = (...args: Trigger[]): Trigger => ({ op: 'or', args });
const not = (arg: Trigger): Trigger => ({ op: 'not', arg });
const landed = (): Trigger =>
  and(le('pos.y', 0), le('vel.y', 0), {
    op: 'gt',
    left: { ref: 'time' } as never,
    right: { const: 0 },
  });
const hitActive = (): Trigger => and(eq('animElem', 1), eq('animTime', 0));

function hd(over: Partial<HitDef> = {}): HitDef {
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

// States layered on top of base's. Authored as plain objects (validated by
// parseCharacter). All reference anim ids present in KFM_ANIMATIONS.
const ADDED_STATES: Record<string, unknown> = {
  // Issue 2: forward/back + up → air roll (high jump), using row-3 (highjump) art.
  highjump: {
    type: 'A',
    moveType: 'I',
    physics: 'A',
    anim: 'highjump.rise',
    ctrl: 0,
    velSet: { y: 11 },
    controllers: [
      { type: 'VelSet', xForward: 5, trigger: eq('time', 0) },
      { type: 'ChangeAnim', value: 'highjump.fall', trigger: lt('vel.y', 0) },
      { type: 'ChangeState', value: 'stand', ctrl: 1, trigger: landed() },
    ],
  },
  // Issue 1: charged attacks (entered by holding the attack button — see patchCharge).
  punchcharge: {
    type: 'S',
    moveType: 'A',
    physics: 'N',
    anim: 'punchcharge',
    ctrl: 0,
    velSet: { x: 0, y: 0 },
    controllers: [
      {
        type: 'HitDef',
        def: hd({
          damage: { hit: 120, guard: 14 },
          pauseTime: { p1: 12, p2: 16 },
          groundVelocity: { x: 7, y: 0 },
          airVelocity: { x: 5, y: 6 },
          priority: 4,
        }),
        trigger: hitActive(),
      },
      { type: 'ChangeState', value: 'stand', ctrl: 1, trigger: ge('time', 30) },
    ],
  },
  kickcharge: {
    type: 'S',
    moveType: 'A',
    physics: 'N',
    anim: 'kickcharge',
    ctrl: 0,
    velSet: { x: 0, y: 0 },
    controllers: [
      {
        type: 'HitDef',
        // Launcher: a real upward pop that arcs back down (hitDef routes the
        // victim to the airborne hit state, which has gravity).
        def: hd({
          damage: { hit: 130, guard: 16 },
          pauseTime: { p1: 12, p2: 18 },
          groundVelocity: { x: 4, y: 9 },
          airVelocity: { x: 4, y: 8 },
          priority: 4,
        }),
        trigger: hitActive(),
      },
      { type: 'ChangeState', value: 'stand', ctrl: 1, trigger: ge('time', 32) },
    ],
  },
  // Issue 3: crouch heavy punch (slow) + crouch light kick (fast).
  crouchHP: {
    type: 'C',
    moveType: 'A',
    physics: 'S',
    anim: 'crouchHP',
    ctrl: 0,
    velSet: { x: 0, y: 0 },
    controllers: [
      {
        type: 'HitDef',
        def: hd({
          attr: { state: 'C', class: 'NA' },
          damage: { hit: 78, guard: 10 },
          pauseTime: { p1: 12, p2: 12 },
          groundVelocity: { x: 5, y: 0 },
          priority: 4,
        }),
        trigger: hitActive(),
      },
      { type: 'ChangeState', value: 'crouch', ctrl: 1, trigger: ge('time', 16) },
    ],
  },
  crouchLK: {
    type: 'C',
    moveType: 'A',
    physics: 'S',
    anim: 'crouchLK',
    ctrl: 0,
    velSet: { x: 0, y: 0 },
    controllers: [
      {
        type: 'HitDef',
        // Crouch light kick is the OTG poke — the one attack that hits a downed
        // opponent (up to MAX_OTG times before they're forced to wake up).
        def: hd({
          attr: { state: 'C', class: 'NA' },
          damage: { hit: 26, guard: 3 },
          pauseTime: { p1: 6, p2: 6 },
          groundVelocity: { x: 3, y: 0 },
          priority: 2,
          canHitDown: true,
        }),
        trigger: hitActive(),
      },
      { type: 'ChangeState', value: 'crouch', ctrl: 1, trigger: ge('time', 10) },
    ],
  },
  // Launched/airborne hit reaction: arc up under gravity, then land into a
  // grounded KNOCKDOWN (overrides base's "recover to stand on landing"). Landing
  // grounds the victim so a corner juggle resolves instead of looping forever.
  'hit.air': {
    type: 'A',
    moveType: 'H',
    physics: 'A',
    anim: 'hit.air',
    ctrl: 0,
    controllers: [{ type: 'ChangeState', value: 'knockdown', trigger: landed() }],
  },
  knockdown: {
    type: 'L',
    moveType: 'H',
    physics: 'S',
    anim: 'knockdown',
    ctrl: 0,
    velSet: { x: 0 },
    controllers: [{ type: 'ChangeState', value: 'getup', trigger: ge('time', 22) }],
  },
  getup: {
    type: 'C',
    moveType: 'I',
    physics: 'S',
    anim: 'getup',
    ctrl: 0,
    velSet: { x: 0 },
    controllers: [{ type: 'ChangeState', value: 'stand', ctrl: 1, trigger: ge('time', 14) }],
  },
  // KO: a defeated fighter tumbles (ko.fall) while still in the air, then snaps
  // to the flat lying pose (ko) once they hit the floor.
  ko: {
    type: 'L',
    moveType: 'I',
    physics: 'S',
    anim: 'ko.fall',
    ctrl: 0,
    controllers: [{ type: 'ChangeAnim', value: 'ko', trigger: le('pos.y', 0) }],
  },
  // Victory pose held during the KO buffer (engine forces the winner here).
  win: {
    type: 'S',
    moveType: 'I',
    physics: 'S',
    anim: 'win',
    ctrl: 0,
    velSet: { x: 0 },
    controllers: [],
  },
};

type Ctrl = { type: string; value?: string; trigger?: unknown };

function insertBefore(controllers: unknown[], pred: (c: Ctrl) => boolean, ctrl: unknown): void {
  const i = controllers.findIndex((c) => pred(c as Ctrl));
  if (i < 0) controllers.push(ctrl);
  else controllers.splice(i, 0, ctrl);
}

// Charged attack = hold the button down for a *deliberate* ~0.5s. The normal now
// recovers only once the button is RELEASED, so a tap (or rapid clicks) always
// does the normal and never charges; the charge fires only after CHARGE_HOLD
// ticks of continuous hold.
const CHARGE_HOLD = 30; // ticks (~0.5s at 60Hz)

function patchCharge(state: { controllers: unknown[] }, button: string, target: string): void {
  const ctrls = state.controllers;
  const i = ctrls.findIndex((c) => {
    const cc = c as Ctrl;
    return cc.type === 'ChangeState' && (cc.value === 'stand' || cc.value === 'crouch');
  });
  if (i < 0) return; // no recovery transition to gate — leave the normal unchanged
  const recover = ctrls[i] as { trigger: Trigger };
  const recoverConst = (recover.trigger as { right?: { const?: unknown } }).right?.const;
  const recoverTime = typeof recoverConst === 'number' ? recoverConst : 8;
  const hold = Math.max(recoverTime, CHARGE_HOLD);

  // Recover only when the button is released (otherwise stay, winding up).
  recover.trigger = and(recover.trigger, not(btn(button)));
  // Charge once held past the threshold.
  const charge = {
    type: 'ChangeState',
    value: target,
    trigger: and(btn(button), ge('time', hold)),
  };
  ctrls.splice(i, 0, charge);
}

interface RawChar {
  meta: Record<string, string>;
  animations: Record<string, unknown>;
  spriteAtlas?: unknown;
  states: Record<string, { controllers: unknown[] }>;
  commands: unknown[];
}

function buildKFMTemplate(): Character {
  const c = structuredClone(baseChar) as unknown as RawChar;
  c.meta = {
    id: 'kfm-template',
    name: 'KFM (action template)',
    author: 'BrawlBox',
    version: '0.1.0',
  };
  c.animations = KFM_ANIMATIONS as unknown as Record<string, unknown>;
  // The sheet bake replaces the atlas; drop base's placeholder one so nothing
  // accidentally renders these new sprite keys against the wrong atlas.
  delete c.spriteAtlas;

  const states = c.states;
  for (const [k, v] of Object.entries(ADDED_STATES)) states[k] = v as { controllers: unknown[] };

  // Diagonal-jump commands for the air roll.
  c.commands.push(
    { name: 'jumpfwd', motion: 'UF', bufferTicks: 4 },
    { name: 'jumpback', motion: 'UB', bufferTicks: 4 },
  );

  const roll = (): unknown => ({
    type: 'ChangeState',
    value: 'highjump',
    ctrl: 0,
    trigger: or(cmd('jumpfwd'), cmd('jumpback')),
  });
  // From stand: before walk (walk would swallow the held forward/back direction).
  const stand = states.stand?.controllers;
  if (stand) insertBefore(stand, (c) => c.value === 'walk', roll());
  // From walk: before the VelSet that keeps it walking.
  const walk = states.walk?.controllers;
  if (walk) insertBefore(walk, (c) => c.type === 'VelSet', roll());

  // Crouch heavy punch (z) + light kick (a), before the stand-up transition.
  const crouch = states.crouch?.controllers;
  if (crouch) {
    const isStandUp = (c: Ctrl): boolean => c.type === 'ChangeState' && c.value === 'stand';
    insertBefore(crouch, isStandUp, { type: 'ChangeState', value: 'crouchHP', trigger: btn('z') });
    insertBefore(crouch, isStandUp, { type: 'ChangeState', value: 'crouchLK', trigger: btn('a') });
  }

  // Hold-to-charge on each standing normal.
  const charges: Array<[string, string, string]> = [
    ['standLP', 'x', 'punchcharge'],
    ['standHP', 'z', 'punchcharge'],
    ['standLK', 'a', 'kickcharge'],
    ['standHK', 'c', 'kickcharge'],
  ];
  for (const [id, button, target] of charges) {
    const st = states[id];
    if (st) patchCharge(st, button, target);
  }

  return parseCharacter(c);
}

export const KFM_TEMPLATE: Character = buildKFMTemplate();
