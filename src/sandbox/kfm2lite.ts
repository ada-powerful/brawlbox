// Reduced "kfm2lite" KFM, built from the slimmed + re-padded atlas
// (kfm2lite-atlas.png + kfm2lite-data.json, produced by
// build-kfm2lite-template.py). Same engine + conventions as kfm2.ts, but with a
// trimmed moveset so the generation template has fewer, roomier poses (cleaner
// green-gap slicing + better NB2 face fidelity):
//   - cut: hook, uppercut, crouchhook, punch2h (and the gallery-only run/spin).
//   - merged onto another row's art (same engine pattern as walkkickHeavy):
//       hk        -> 'lk'        (heavier standing kick)
//       crouchhk  -> 'crouchlk'  (heavier crouch kick)
//       dashkick* -> 'walkkick'  (dash kicks share the walk-kick art)
//       jumplk    -> 'jumphk'    (already shared; its own row is dropped)
// Throw + all reaction/system anims (hit, hitair, guard*, launch, win) are kept.
import { parseCharacter, type Animation, type Character } from '@/engine/schema.ts';
import kfm2liteData from './kfm2lite-data.json' with { type: 'json' };
import kfm2liteAtlasUrl from './kfm2lite-atlas.png';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
const data = kfm2liteData as unknown as {
  cell: { w: number; h: number };
  frames: Record<string, Rect>;
  anims: Record<string, string[]>;
};

// Looping/ambient actions; everything else plays once.
const LOOPING = new Set(['stand', 'walk']);
// Base-action rows whose keyframes were halved on the sheet (see
// build-kfm2lite-template.py `HALVE`). We double each kept frame's duration so
// the action still spans the same number of ticks — fewer drawn poses, same
// feel. Keyed by the data.json anim name (pre-'idle'→'stand' rename).
const HALVED = new Set(['idle', 'walk', 'walkkick', 'punchcharge', 'throw', 'intro']);
// Generic body hurtbox (combat-accurate boxes are a later pass).
const HURT = [{ x: -30, y: 0, w: 60, h: 100 }];
const HURT_LOW = [{ x: -28, y: 0, w: 56, h: 60 }];

// Attack anims get a hitbox on their active frame so the moves connect. Keyed by
// ANIM name: merged states (hk/crouchhk/dashkick) borrow these anims, so they
// reuse the same active-frame geometry — only their HitDef damage/recovery differ.
type AtkCfg = { active: number; box: [number, number, number, number]; low?: boolean };
const ATTACKS: Record<string, AtkCfg> = {
  punch: { active: 1, box: [30, 55, 55, 28] },
  lk: { active: 1, box: [30, 38, 55, 28] }, // also used by the heavy kick (hk state)
  crouchpunch: { active: 1, box: [28, 22, 48, 24], low: true },
  crouchlk: { active: 1, box: [30, 8, 55, 22], low: true }, // also the crouch heavy (crouchhk)
  jumppunch: { active: 1, box: [25, 38, 56, 34] },
  jumphk: { active: 1, box: [25, 30, 64, 40] }, // also used by jumplk state
  // Charged punch (hold the punch button) + walking / dashing kicks. These two
  // rows are halved (keep frames 0,2,4,6): the old strike at frame 3 is dropped,
  // but the kept frame 4 (new index 2) is still fully extended — so active=2.
  punchcharge: { active: 2, box: [30, 48, 86, 46] },
  walkkick: { active: 2, box: [30, 38, 74, 34] }, // also used by the dash kicks
};

function buildAnimations(): Record<string, Animation> {
  const out: Record<string, Animation> = {};
  for (const [name0, keys] of Object.entries(data.anims)) {
    if (keys.length === 0) continue;
    // The engine's neutral animation id is 'stand' (createWorld seeds animId
    // there); the idle row takes that name so the fighter renders at rest.
    const name = name0 === 'idle' ? 'stand' : name0;
    const atk = ATTACKS[name];
    const halveMul = HALVED.has(name0) ? 2 : 1; // doubled tick budget per kept frame
    out[name] = {
      loop: LOOPING.has(name),
      frames: keys.map((sprite, i) => ({
        sprite,
        duration: (LOOPING.has(name) ? 6 : 4) * halveMul,
        offset: { x: 0, y: 0 },
        hurtboxes: atk?.low ? HURT_LOW : HURT,
        hitboxes:
          atk && i === atk.active
            ? [{ x: atk.box[0], y: atk.box[1], w: atk.box[2], h: atk.box[3] }]
            : [],
      })),
    };
  }
  // Split the throw row into its grab (lift) and toss phases. The row is halved
  // now, so split proportionally (grab was ~5/13 of the full row) instead of at
  // a fixed index.
  const throwAnim = out['throw'];
  if (throwAnim) {
    const grab = Math.max(1, Math.round((throwAnim.frames.length * 5) / 13));
    out['throwgrab'] = { loop: false, frames: throwAnim.frames.slice(0, grab) };
    out['throwtoss'] = { loop: false, frames: throwAnim.frames.slice(grab) };
  }
  // Reaction frames carved from the two hit rows. The 'hit' row falls to the
  // ground (frames 5+): that slice is the air/launched reaction (hitfall, used
  // by hit.air — no separate launch row anymore) and a thrown victim's landing
  // (tossed). The standing flinch's early frames are dropped so an airborne
  // victim never looks like it's standing. The 'hitair' row stays upright
  // through frame 4, so its first 5 frames are the standing flinch (hit.stand);
  // its tail is the knockdown lie + get-up.
  const hit = out['hit'];
  const hitair = out['hitair'];
  if (hit) {
    out['hitfall'] = { loop: false, frames: hit.frames.slice(5) };
    out['tossed'] = { loop: false, frames: hit.frames.slice(5) };
  }
  if (hitair) {
    out['hitstand'] = { loop: false, frames: hitair.frames.slice(0, 5) };
    out['kdlie'] = { loop: false, frames: [hitair.frames[5]!] };
    out['getup'] = { loop: false, frames: hitair.frames.slice(6, 10) };
    // Dizzy/stun: loop the standing recoil so the fighter wobbles in place.
    out['dizzy'] = { loop: true, frames: hitair.frames.slice(2, 5) };
  }
  // The raw 'hit'/'hitair' rows are internal sources only — every state plays
  // one of the derived slices above — so drop them from the animation set. That
  // keeps them out of the Controls/gallery listing (which surfaces any anim not
  // bound to a state); their sprite rects stay in the atlas for the slices.
  delete out['hit'];
  delete out['hitair'];
  return out;
}

export const KFM2LITE_ATLAS_URL: string = kfm2liteAtlasUrl;

// --- Core state machine. Trigger AST helpers (mirrors kfm2.ts).
type T = Record<string, unknown>;
const ge = (ref: string, n: number): T => ({ op: 'ge', left: { ref }, right: { const: n } });
const le = (ref: string, n: number): T => ({ op: 'le', left: { ref }, right: { const: n } });
const eq = (ref: string, n: number): T => ({ op: 'eq', left: { ref }, right: { const: n } });
const btn = (b: string): T => ({ op: 'button', held: b });
const cmd = (name: string): T => ({ op: 'command', name });
const and = (...args: T[]): T => ({ op: 'and', args });
const or = (...args: T[]): T => ({ op: 'or', args });
const not = (arg: T): T => ({ op: 'not', arg });
const landed = (): T =>
  and(le('pos.y', 0), le('vel.y', 0), { op: 'gt', left: { ref: 'time' }, right: { const: 0 } });

function hd(over: T = {}): T {
  return {
    attr: { state: 'S', class: 'NA' },
    damage: { hit: 45, guard: 5 },
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

function buildStates(anims: Record<string, Animation>): Record<string, unknown> {
  // Anim length in ticks. Sums real per-frame durations (halved rows carry
  // doubled durations), so state timing is unchanged by the keyframe halving.
  const dur = (id: string): number =>
    (anims[id]?.frames ?? []).reduce((t, f) => t + (f.duration ?? 4), 0) || 4;
  // An attack state: HitDef on the active frame, then return to `back`.
  const atk = (anim: string, active: number, back: string, opts: T = {}): T => {
    const s: T = {
      type: opts.type ?? 'S',
      moveType: 'A',
      physics: opts.physics ?? 'N',
      anim,
      ctrl: 0,
      controllers: [
        {
          type: 'HitDef',
          def: hd(opts.hd as T),
          trigger: and(eq('animElem', active), eq('animTime', 0)),
        },
        opts.land
          ? { type: 'ChangeState', value: back, ctrl: 1, trigger: landed() }
          : {
              type: 'ChangeState',
              value: back,
              ctrl: 1,
              trigger: ge('time', (opts.ret as number) ?? dur(anim)),
            },
      ],
    };
    if (!opts.land) s.velSet = { x: 0, y: 0 };
    return s;
  };

  // Chargeable punch: tap = punch, hold past CHARGE_HOLD = wind up into the
  // charged punch.
  const CHARGE_HOLD = 30;
  const chargePunch = (button: string, hdOver: T, recover: number): T => ({
    type: 'S',
    moveType: 'A',
    physics: 'N',
    anim: 'punch',
    ctrl: 0,
    velSet: { x: 0, y: 0 },
    controllers: [
      { type: 'HitDef', def: hd(hdOver), trigger: and(eq('animElem', 1), eq('animTime', 0)) },
      {
        type: 'ChangeState',
        value: 'punchcharge',
        trigger: and(btn(button), ge('time', CHARGE_HOLD)),
      },
      {
        type: 'ChangeState',
        value: 'stand',
        ctrl: 1,
        trigger: and(not(btn(button)), ge('time', recover)),
      },
    ],
  });

  // Air attacks shared by both jump and the forward roll.
  const airAttacks: T[] = [
    { type: 'ChangeState', value: 'jumppunch', trigger: or(btn('x'), btn('z')) },
    { type: 'ChangeState', value: 'jumplk', trigger: btn('a') },
    { type: 'ChangeState', value: 'jumphk', trigger: btn('c') },
  ];

  return {
    stand: {
      type: 'S',
      moveType: 'I',
      physics: 'S',
      anim: 'stand',
      ctrl: 1,
      velSet: { x: 0 },
      controllers: [
        // LP+HP together near the opponent = throw. (The hook/uppercut/2-hand
        // specials were cut for the lite moveset.)
        {
          type: 'ChangeState',
          value: 'throw',
          trigger: and(btn('x'), btn('z'), le('p2BodyDist', 22)),
        },
        // Stance/jump take priority over single attack buttons.
        { type: 'ChangeState', value: 'jumproll', trigger: cmd('fjump') }, // forward+up = roll
        { type: 'ChangeState', value: 'jump', trigger: btn('up') },
        { type: 'ChangeState', value: 'crouch', trigger: btn('down') },
        // Light punch = x, heavy punch = z; both use the punch animation.
        { type: 'ChangeState', value: 'punch', trigger: btn('x') },
        { type: 'ChangeState', value: 'punchHeavy', trigger: btn('z') },
        { type: 'ChangeState', value: 'lk', trigger: btn('a') },
        { type: 'ChangeState', value: 'hk', trigger: btn('c') },
        { type: 'ChangeState', value: 'dash', trigger: cmd('dash') },
        { type: 'ChangeState', value: 'walk', trigger: or(btn('left'), btn('right')) },
      ],
    },
    walk: {
      type: 'S',
      moveType: 'I',
      physics: 'N',
      anim: 'walk',
      ctrl: 1,
      controllers: [
        // LP+HP while walking forward near the opponent = throw.
        {
          type: 'ChangeState',
          value: 'throw',
          trigger: and(btn('x'), btn('z'), le('p2BodyDist', 22)),
        },
        { type: 'ChangeState', value: 'punch', trigger: btn('x') },
        { type: 'ChangeState', value: 'punchHeavy', trigger: btn('z') },
        // Kicks while walking use the dedicated walk-kick.
        { type: 'ChangeState', value: 'walkkick', trigger: btn('a') },
        { type: 'ChangeState', value: 'walkkickHeavy', trigger: btn('c') },
        { type: 'ChangeState', value: 'jumproll', trigger: cmd('fjump') },
        { type: 'VelSet', x: 3, trigger: btn('right') },
        { type: 'VelSet', x: -2.4, trigger: btn('left') },
        { type: 'ChangeState', value: 'jump', trigger: btn('up') },
        { type: 'ChangeState', value: 'stand', trigger: and(not(btn('left')), not(btn('right'))) },
      ],
    },
    dash: {
      type: 'S',
      moveType: 'I',
      physics: 'S',
      anim: 'dash',
      ctrl: 0,
      controllers: [
        { type: 'VelSet', xForward: 8, trigger: eq('time', 0) },
        // Kick out of the dash → dashing kick (shares the walk-kick art), light/heavy.
        { type: 'ChangeState', value: 'dashkick', trigger: btn('a') },
        { type: 'ChangeState', value: 'dashkickHeavy', trigger: btn('c') },
        { type: 'ChangeState', value: 'stand', ctrl: 1, trigger: ge('time', dur('dash')) },
      ],
    },
    jump: {
      type: 'A',
      moveType: 'I',
      physics: 'A',
      anim: 'jump',
      velSet: { y: 11 },
      ctrl: 0,
      controllers: [
        {
          type: 'VelSet',
          y: 7,
          trigger: and(not(btn('up')), { op: 'gt', left: { ref: 'vel.y' }, right: { const: 7 } }),
        },
        ...airAttacks,
        { type: 'ChangeState', value: 'stand', ctrl: 1, trigger: landed() },
      ],
    },
    // Forward roll: cross-up arc that clears the opponent's head. Same air attacks.
    jumproll: {
      type: 'A',
      moveType: 'I',
      physics: 'A',
      anim: 'jumproll',
      velSet: { y: 11 },
      ctrl: 0,
      controllers: [
        { type: 'VelSet', xForward: 4, trigger: eq('time', 0) },
        ...airAttacks,
        { type: 'ChangeState', value: 'stand', ctrl: 1, trigger: landed() },
      ],
    },
    crouch: {
      type: 'C',
      moveType: 'I',
      physics: 'S',
      anim: 'crouch',
      ctrl: 1,
      velSet: { x: 0 },
      controllers: [
        { type: 'ChangeState', value: 'crouchpunch', trigger: btn('x') },
        { type: 'ChangeState', value: 'crouchpunchHeavy', trigger: btn('z') },
        { type: 'ChangeState', value: 'crouchlk', trigger: btn('a') },
        { type: 'ChangeState', value: 'crouchhk', trigger: btn('c') },
        { type: 'ChangeState', value: 'stand', trigger: not(btn('down')) },
      ],
    },
    // Light (x) / heavy (z) punch — both chargeable.
    punch: chargePunch('x', {}, dur('punch')),
    punchHeavy: chargePunch(
      'z',
      {
        damage: { hit: 80, guard: 10 },
        groundVelocity: { x: 6, y: 0 },
        pauseTime: { p1: 12, p2: 12 },
      },
      dur('punch') + 8,
    ),
    punchcharge: atk('punchcharge', 2, 'stand', {
      hd: {
        damage: { hit: 110, guard: 14 },
        groundVelocity: { x: 7, y: 2 },
        airVelocity: { x: 5, y: 5 },
        pauseTime: { p1: 14, p2: 16 },
      },
    }),
    // Standing light/heavy kick share the 'lk' art; heavy is slower + harder.
    lk: atk('lk', 1, 'stand'),
    hk: atk('lk', 1, 'stand', {
      hd: { damage: { hit: 75, guard: 10 }, groundVelocity: { x: 6, y: 0 } },
      ret: dur('lk') + 6,
    }),
    // Walking kicks and dashing kicks all share the 'walkkick' art; differ in power.
    walkkick: atk('walkkick', 2, 'stand', {
      hd: { damage: { hit: 42, guard: 6 }, groundVelocity: { x: 5, y: 0 } },
    }),
    walkkickHeavy: atk('walkkick', 2, 'stand', {
      hd: { damage: { hit: 70, guard: 10 }, groundVelocity: { x: 6, y: 0 } },
      ret: dur('walkkick') + 6,
    }),
    dashkick: atk('walkkick', 2, 'stand', {
      hd: {
        damage: { hit: 55, guard: 8 },
        groundVelocity: { x: 7, y: 1 },
        pauseTime: { p1: 12, p2: 12 },
      },
    }),
    dashkickHeavy: atk('walkkick', 2, 'stand', {
      hd: { damage: { hit: 85, guard: 12 }, groundVelocity: { x: 8, y: 2 } },
      ret: dur('walkkick') + 6,
    }),
    crouchpunch: atk('crouchpunch', 1, 'crouch', { type: 'C', physics: 'S' }),
    crouchpunchHeavy: atk('crouchpunch', 1, 'crouch', {
      type: 'C',
      physics: 'S',
      hd: { damage: { hit: 72, guard: 10 } },
      ret: dur('crouchpunch') + 8,
    }),
    // Crouch light/heavy kick share the 'crouchlk' art; heavy is harder + slower.
    crouchlk: atk('crouchlk', 1, 'crouch', { type: 'C', physics: 'S' }),
    crouchhk: atk('crouchlk', 1, 'crouch', {
      type: 'C',
      physics: 'S',
      hd: { damage: { hit: 70, guard: 10 } },
      ret: dur('crouchlk') + 6,
    }),
    // Jump attacks are OVERHEADS (guardFlag 'H') — must be stand-blocked.
    jumppunch: atk('jumppunch', 1, 'stand', {
      type: 'A',
      physics: 'A',
      land: true,
      hd: { guardFlag: 'H' },
    }),
    // Jump LK shares the jump-HK art; they differ only in power.
    jumplk: atk('jumphk', 1, 'stand', {
      type: 'A',
      physics: 'A',
      land: true,
      hd: { guardFlag: 'H', damage: { hit: 35, guard: 4 } },
    }),
    jumphk: atk('jumphk', 1, 'stand', {
      type: 'A',
      physics: 'A',
      land: true,
      hd: { guardFlag: 'H', damage: { hit: 65, guard: 9 } },
    }),

    // Throw (LP+HP near the opponent): grab → toss in a parabola behind you.
    throw: {
      type: 'S',
      moveType: 'A',
      physics: 'N',
      anim: 'throwgrab',
      ctrl: 0,
      velSet: { x: 0, y: 0 },
      controllers: [
        {
          type: 'Throw',
          def: {
            range: { x: 26, y: 60 },
            damage: 90,
            attackerState: 'throwexec',
            releaseState: 'tossed',
            bindTime: 16,
            bindPos: { x: -34, y: 22 },
            throwVel: { x: -4, y: 8 },
          },
          trigger: le('time', 3),
        },
        { type: 'ChangeState', value: 'stand', ctrl: 1, trigger: ge('time', dur('throwgrab')) },
      ],
    },
    throwexec: {
      type: 'S',
      moveType: 'A',
      physics: 'N',
      anim: 'throwtoss',
      ctrl: 0,
      velSet: { x: 0, y: 0 },
      controllers: [
        { type: 'ChangeState', value: 'stand', ctrl: 1, trigger: ge('time', dur('throwtoss')) },
      ],
    },

    // Thrown/launched victim reaction: arc through the air, land into a knockdown.
    tossed: {
      type: 'A',
      moveType: 'H',
      physics: 'A',
      anim: 'tossed',
      ctrl: 0,
      controllers: [{ type: 'ChangeState', value: 'knockdown', trigger: landed() }],
    },
    knockdown: {
      type: 'L',
      moveType: 'H',
      physics: 'S',
      anim: 'kdlie',
      ctrl: 0,
      velSet: { x: 0 },
      controllers: [{ type: 'ChangeState', value: 'getup', trigger: ge('time', 24) }],
    },
    getup: {
      type: 'C',
      moveType: 'I',
      physics: 'S',
      anim: 'getup',
      ctrl: 0,
      velSet: { x: 0 },
      controllers: [
        { type: 'ChangeState', value: 'stand', ctrl: 1, trigger: ge('time', dur('getup')) },
      ],
    },

    // Time-up loss: slumps into the dizzy stagger (distinct from a KO).
    lose: {
      type: 'S',
      moveType: 'I',
      physics: 'S',
      anim: 'dizzy',
      ctrl: 0,
      velSet: { x: 0 },
      controllers: [],
    },
    // Dizzy/stun: helpless for the stun window, then back to standing.
    dizzy: {
      type: 'S',
      moveType: 'H',
      physics: 'S',
      anim: 'dizzy',
      ctrl: 0,
      velSet: { x: 0 },
      controllers: [{ type: 'ChangeState', value: 'stand', ctrl: 1, trigger: ge('time', 120) }],
    },
    // Victory pose held during the KO buffer.
    win: {
      type: 'S',
      moveType: 'I',
      physics: 'S',
      anim: 'win',
      ctrl: 0,
      velSet: { x: 0 },
      controllers: [],
    },
    // Standing hit: the upright flinch (hitair row's first 5 frames).
    'hit.stand': {
      type: 'S',
      moveType: 'H',
      physics: 'S',
      anim: 'hitstand',
      ctrl: 0,
      controllers: [{ type: 'ChangeState', value: 'stand', ctrl: 1, trigger: ge('time', 12) }],
    },
    // Air/launched hit: the falling slice of the hit row, then knockdown on land.
    'hit.air': {
      type: 'A',
      moveType: 'H',
      physics: 'A',
      anim: 'hitfall',
      ctrl: 0,
      controllers: [{ type: 'ChangeState', value: 'knockdown', trigger: landed() }],
    },
    'guard.stand': {
      type: 'S',
      moveType: 'I',
      physics: 'S',
      anim: 'guardstand',
      ctrl: 0,
      controllers: [{ type: 'ChangeState', value: 'stand', ctrl: 1, trigger: ge('time', 11) }],
    },
    'guard.crouch': {
      type: 'C',
      moveType: 'I',
      physics: 'S',
      anim: 'guardcrouch',
      ctrl: 0,
      controllers: [{ type: 'ChangeState', value: 'crouch', ctrl: 1, trigger: ge('time', 11) }],
    },
    'guard.air': {
      type: 'A',
      moveType: 'I',
      physics: 'A',
      anim: 'guardstand',
      ctrl: 0,
      controllers: [{ type: 'ChangeState', value: 'stand', ctrl: 1, trigger: landed() }],
    },
    // KO: knocked out flat on the ground, held through the KO buffer.
    ko: { type: 'L', moveType: 'I', physics: 'S', anim: 'kdlie', ctrl: 0, controllers: [] },
  };
}

const animations = buildAnimations();

export const KFM2LITE_CHARACTER: Character = parseCharacter({
  meta: {
    id: 'kfm2lite',
    name: 'KFM (lite 26-action sheet)',
    author: 'BrawlBox',
    version: '0.1.0',
  },
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
  size: { width: 60, height: 110, headY: 100 },
  states: buildStates(animations),
  animations,
  commands: [
    { name: 'dash', motion: 'F,F', bufferTicks: 12 },
    { name: 'fjump', motion: 'UF', bufferTicks: 4 },
  ],
  spriteAtlas: { url: 'kfm2lite/atlas.png', frames: data.frames },
});
