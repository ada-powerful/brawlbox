// Full 36-action KFM, built from the pre-baked atlas (kfm2-atlas.png) + frame
// data (kfm2-data.json) generated offline from the magenta/green reference
// sheet. STAGE 1: every row is mapped to an animation so the gallery shows all
// actions against the sheet; the playable state machine + new specials (hooks,
// uppercut, small jump, dizzy) land in stage 2.
import { parseCharacter, type Animation, type Character } from '@/engine/schema.ts';
import kfm2Data from './kfm2-data.json' with { type: 'json' };
import kfm2AtlasUrl from './kfm2-atlas.png';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
const data = kfm2Data as unknown as {
  cell: { w: number; h: number };
  frames: Record<string, Rect>;
  anims: Record<string, string[]>;
};

// Looping/ambient actions; everything else plays once.
const LOOPING = new Set(['stand', 'walk', 'run']);
// Generic body hurtbox (combat-accurate boxes are a stage-2 pass).
const HURT = [{ x: -30, y: 0, w: 60, h: 100 }];
const HURT_LOW = [{ x: -28, y: 0, w: 56, h: 60 }];

// Attack anims get a hitbox on their active frame so the moves connect. (Active
// frame / box geometry are first-pass; stage 2 tunes per move.)
type AtkCfg = { active: number; box: [number, number, number, number]; low?: boolean };
const ATTACKS: Record<string, AtkCfg> = {
  punch: { active: 1, box: [30, 55, 55, 28] },
  lk: { active: 1, box: [30, 38, 55, 28] },
  hk: { active: 2, box: [30, 45, 72, 38] },
  crouchpunch: { active: 1, box: [28, 22, 48, 24], low: true },
  crouchlk: { active: 1, box: [30, 8, 55, 22], low: true },
  crouchhk: { active: 2, box: [30, 8, 70, 26], low: true },
  jumppunch: { active: 1, box: [25, 38, 56, 34] },
  jumplk: { active: 0, box: [22, 14, 70, 56] }, // generous reach — jump-in kicks should connect easily
  jumphk: { active: 1, box: [25, 30, 64, 40] },
  // Two-button (LP+HP) specials — generous reach so they out-range the throw.
  punch2h: { active: 2, box: [28, 46, 104, 48] },
  hook: { active: 2, box: [30, 48, 100, 40] },
  uppercut: { active: 3, box: [22, 50, 56, 78] }, // tall — anti-air launcher
  crouchhook: { active: 2, box: [28, 16, 64, 32], low: true },
  // Charged punch (hold the punch button) + walking / dashing kicks.
  punchcharge: { active: 3, box: [30, 48, 86, 46] },
  walkkick: { active: 3, box: [30, 38, 74, 34] },
  dashkick: { active: 3, box: [32, 40, 92, 36] }, // long forward reach
};

function buildAnimations(): Record<string, Animation> {
  const out: Record<string, Animation> = {};
  for (const [name0, keys] of Object.entries(data.anims)) {
    if (keys.length === 0) continue;
    // The engine's neutral animation id is 'stand' (createWorld seeds animId
    // there); row 1 (idle) takes that name so the fighter renders at rest.
    const name = name0 === 'idle' ? 'stand' : name0;
    const atk = ATTACKS[name];
    out[name] = {
      loop: LOOPING.has(name),
      frames: keys.map((sprite, i) => ({
        sprite,
        duration: LOOPING.has(name) ? 6 : 4,
        offset: { x: 0, y: 0 },
        hurtboxes: atk?.low ? HURT_LOW : HURT,
        hitboxes: atk && i === atk.active ? [{ x: atk.box[0], y: atk.box[1], w: atk.box[2], h: atk.box[3] }] : [],
      })),
    };
  }
  // Split the throw row into its grab (frames 0-4) and toss (5+) phases.
  const throwAnim = out['throw'];
  if (throwAnim) {
    out['throwgrab'] = { loop: false, frames: throwAnim.frames.slice(0, 5) };
    out['throwtoss'] = { loop: false, frames: throwAnim.frames.slice(5) };
  }
  // Launched-victim reaction frames, carved from the hit rows:
  //   tossed = row 33 frames 5-10 (horizontal flying → head-down parabola)
  //   kdlie  = row 34 frame 5 (lying on the back)
  //   getup  = row 34 frames 6-9 (rising off the ground)
  const hit = out['hit'];
  const hitair = out['hitair'];
  if (hit) out['tossed'] = { loop: false, frames: hit.frames.slice(5) };
  if (hitair) {
    out['kdlie'] = { loop: false, frames: [hitair.frames[5]!] };
    out['getup'] = { loop: false, frames: hitair.frames.slice(6, 10) };
  }
  // Dizzy/stun = row 35 frames 8-10 (the stagger after a launch); looped so the
  // fighter wobbles in place for the whole stun window.
  const launch = out['launch'];
  if (launch) out['dizzy'] = { loop: true, frames: launch.frames.slice(8) };
  return out;
}

export const KFM2_ATLAS_URL: string = kfm2AtlasUrl;

// --- Core state machine (stage 1: movement, normals, jumps, crouch, guard, KO).
// Specials (hooks/uppercut/small-jump/throw) + detailed hit frames are stage 2.
type T = Record<string, unknown>;
const ge = (ref: string, n: number): T => ({ op: 'ge', left: { ref }, right: { const: n } });
const le = (ref: string, n: number): T => ({ op: 'le', left: { ref }, right: { const: n } });
const eq = (ref: string, n: number): T => ({ op: 'eq', left: { ref }, right: { const: n } });
const btn = (b: string): T => ({ op: 'button', held: b });
const cmd = (name: string): T => ({ op: 'command', name });
const and = (...args: T[]): T => ({ op: 'and', args });
const or = (...args: T[]): T => ({ op: 'or', args });
const not = (arg: T): T => ({ op: 'not', arg });
const landed = (): T => and(le('pos.y', 0), le('vel.y', 0), { op: 'gt', left: { ref: 'time' }, right: { const: 0 } });

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
  const dur = (id: string): number => (anims[id]?.frames.length ?? 1) * 4; // anim length in ticks
  // An attack state: HitDef on the active frame, then return to `back`.
  const atk = (anim: string, active: number, back: string, opts: T = {}): T => {
    const s: T = {
      type: opts.type ?? 'S',
      moveType: 'A',
      physics: opts.physics ?? 'N',
      anim,
      ctrl: 0,
      controllers: [
        { type: 'HitDef', def: hd(opts.hd as T), trigger: and(eq('animElem', active), eq('animTime', 0)) },
        opts.land
          ? { type: 'ChangeState', value: back, ctrl: 1, trigger: landed() }
          : { type: 'ChangeState', value: back, ctrl: 1, trigger: ge('time', (opts.ret as number) ?? dur(anim)) },
      ],
    };
    // Ground attacks plant the feet; air attacks keep the jump's momentum so the
    // arc (and a roll's forward travel) continues while attacking.
    if (!opts.land) s.velSet = { x: 0, y: 0 };
    return s;
  };

  // Chargeable punch: the normal punch hits on its active frame, but if the
  // player KEEPS HOLDING the button past CHARGE_HOLD ticks it winds up into the
  // charged punch (row 9). Tapping (release early) just recovers to standing.
  const CHARGE_HOLD = 30;
  const chargePunch = (button: string, hdOver: T, recover: number): T => ({
    type: 'S', moveType: 'A', physics: 'N', anim: 'punch', ctrl: 0, velSet: { x: 0, y: 0 },
    controllers: [
      { type: 'HitDef', def: hd(hdOver), trigger: and(eq('animElem', 1), eq('animTime', 0)) },
      { type: 'ChangeState', value: 'punchcharge', trigger: and(btn(button), ge('time', CHARGE_HOLD)) },
      { type: 'ChangeState', value: 'stand', ctrl: 1, trigger: and(not(btn(button)), ge('time', recover)) },
    ],
  });

  // Air attacks shared by both jump and the forward roll (same moves in the air).
  const airAttacks: T[] = [
    { type: 'ChangeState', value: 'jumppunch', trigger: or(btn('x'), btn('z')) },
    { type: 'ChangeState', value: 'jumplk', trigger: btn('a') },
    { type: 'ChangeState', value: 'jumphk', trigger: btn('c') },
  ];

  return {
    stand: {
      type: 'S', moveType: 'I', physics: 'S', anim: 'stand', ctrl: 1, velSet: { x: 0 },
      controllers: [
        // LP+HP together, routed by modifier: uppercut (down+forward — a deliberate
        // crouching motion, so it never collides with jump/hook) → throw (near) →
        // crouch hook (down, no forward) → hook (forward) → 2-hand punch (neutral).
        { type: 'ChangeState', value: 'uppercut', trigger: and(btn('x'), btn('z'), btn('down'), or(btn('left'), btn('right'))) },
        { type: 'ChangeState', value: 'throw', trigger: and(btn('x'), btn('z'), le('p2BodyDist', 22)) },
        { type: 'ChangeState', value: 'crouchhook', trigger: and(btn('x'), btn('z'), btn('down')) },
        { type: 'ChangeState', value: 'hook', trigger: and(btn('x'), btn('z'), or(btn('left'), btn('right'))) },
        { type: 'ChangeState', value: 'punch2h', trigger: and(btn('x'), btn('z')) },
        // Stance/jump take priority over single attack buttons, so down+attack is a
        // crouch attack and up+attack is a jump attack (not a standing one).
        { type: 'ChangeState', value: 'jumproll', trigger: cmd('fjump') }, // forward+up = roll over the opponent
        { type: 'ChangeState', value: 'jump', trigger: btn('up') },
        { type: 'ChangeState', value: 'crouch', trigger: btn('down') },
        // Light punch = x, heavy punch = z; both use the punch animation (heavy
        // is slower + harder, per the sheet's "same art, different power/speed").
        { type: 'ChangeState', value: 'punch', trigger: btn('x') },
        { type: 'ChangeState', value: 'punchHeavy', trigger: btn('z') },
        { type: 'ChangeState', value: 'lk', trigger: btn('a') },
        { type: 'ChangeState', value: 'hk', trigger: btn('c') },
        { type: 'ChangeState', value: 'dash', trigger: cmd('dash') },
        { type: 'ChangeState', value: 'walk', trigger: or(btn('left'), btn('right')) },
      ],
    },
    walk: {
      type: 'S', moveType: 'I', physics: 'N', anim: 'walk', ctrl: 1,
      controllers: [
        // LP+HP while walking forward: throw (if near) → uppercut (if +up) → hook.
        // Walking forward already holds a direction, so down+LP+HP = down+forward = uppercut.
        { type: 'ChangeState', value: 'uppercut', trigger: and(btn('x'), btn('z'), btn('down')) },
        { type: 'ChangeState', value: 'throw', trigger: and(btn('x'), btn('z'), le('p2BodyDist', 22)) },
        { type: 'ChangeState', value: 'hook', trigger: and(btn('x'), btn('z')) },
        { type: 'ChangeState', value: 'punch', trigger: btn('x') },
        { type: 'ChangeState', value: 'punchHeavy', trigger: btn('z') },
        // Kicks while walking use the dedicated walk-kick (row 20).
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
      type: 'S', moveType: 'I', physics: 'S', anim: 'dash', ctrl: 0,
      controllers: [
        { type: 'VelSet', xForward: 8, trigger: eq('time', 0) },
        // Kick out of the dash → dashing kick (row 21), light (a) / heavy (c).
        { type: 'ChangeState', value: 'dashkick', trigger: btn('a') },
        { type: 'ChangeState', value: 'dashkickHeavy', trigger: btn('c') },
        { type: 'ChangeState', value: 'stand', ctrl: 1, trigger: ge('time', dur('dash')) },
      ],
    },
    jump: {
      // Full (held) jump matches the roll's height (peak ~116) so an in-place jump
      // also clears the opponent. Releasing up early caps the rise to a low short
      // hop (the "small jump", peak ~70) that stays under the opponent's head.
      type: 'A', moveType: 'I', physics: 'A', anim: 'jump', velSet: { y: 11 }, ctrl: 0,
      controllers: [
        { type: 'VelSet', y: 7, trigger: and(not(btn('up')), { op: 'gt', left: { ref: 'vel.y' }, right: { const: 7 } }) },
        ...airAttacks,
        { type: 'ChangeState', value: 'stand', ctrl: 1, trigger: landed() },
      ],
    },
    // Forward roll: a cross-up arc that just clears the opponent's ~110px head
    // (peak ~120) without soaring — low enough that the air attacks still reach
    // the opponent on the way over/down. Same air attacks as the normal jump.
    jumproll: {
      type: 'A', moveType: 'I', physics: 'A', anim: 'jumproll', velSet: { y: 11 }, ctrl: 0,
      controllers: [
        { type: 'VelSet', xForward: 4, trigger: eq('time', 0) }, // arc forward over the opponent
        ...airAttacks,
        { type: 'ChangeState', value: 'stand', ctrl: 1, trigger: landed() },
      ],
    },
    crouch: {
      type: 'C', moveType: 'I', physics: 'S', anim: 'crouch', ctrl: 1, velSet: { x: 0 },
      controllers: [
        // Already crouching (down held): + forward + LP+HP = down+forward = uppercut;
        // LP+HP without a direction = crouch hook.
        { type: 'ChangeState', value: 'uppercut', trigger: and(btn('x'), btn('z'), or(btn('left'), btn('right'))) },
        { type: 'ChangeState', value: 'crouchhook', trigger: and(btn('x'), btn('z')) }, // crouch LP+HP
        { type: 'ChangeState', value: 'crouchpunch', trigger: btn('x') },
        { type: 'ChangeState', value: 'crouchpunchHeavy', trigger: btn('z') },
        { type: 'ChangeState', value: 'crouchlk', trigger: btn('a') },
        { type: 'ChangeState', value: 'crouchhk', trigger: btn('c') },
        { type: 'ChangeState', value: 'stand', trigger: not(btn('down')) },
      ],
    },
    // Light (x) / heavy (z) punch — both chargeable: hold to wind up into the
    // charged punch (row 9).
    punch: chargePunch('x', {}, dur('punch')),
    punchHeavy: chargePunch('z', { damage: { hit: 80, guard: 10 }, groundVelocity: { x: 6, y: 0 }, pauseTime: { p1: 12, p2: 12 } }, dur('punch') + 8),
    // Charged punch: slow heavy hit that knocks the opponent away.
    punchcharge: atk('punchcharge', 3, 'stand', { hd: { damage: { hit: 110, guard: 14 }, groundVelocity: { x: 7, y: 2 }, airVelocity: { x: 5, y: 5 }, pauseTime: { p1: 14, p2: 16 } } }),
    lk: atk('lk', 1, 'stand'),
    hk: atk('hk', 2, 'stand', { hd: { damage: { hit: 75, guard: 10 }, groundVelocity: { x: 6, y: 0 } } }),
    // Walking kicks (row 20) and dashing kicks (row 21) — light/heavy share art,
    // differ in power; the dash kick reaches further with more pushback.
    walkkick: atk('walkkick', 3, 'stand', { hd: { damage: { hit: 42, guard: 6 }, groundVelocity: { x: 5, y: 0 } } }),
    walkkickHeavy: atk('walkkick', 3, 'stand', { hd: { damage: { hit: 70, guard: 10 }, groundVelocity: { x: 6, y: 0 } }, ret: dur('walkkick') + 6 }),
    dashkick: atk('dashkick', 3, 'stand', { hd: { damage: { hit: 55, guard: 8 }, groundVelocity: { x: 7, y: 1 }, pauseTime: { p1: 12, p2: 12 } } }),
    dashkickHeavy: atk('dashkick', 3, 'stand', { hd: { damage: { hit: 85, guard: 12 }, groundVelocity: { x: 8, y: 2 } }, ret: dur('dashkick') + 6 }),
    crouchpunch: atk('crouchpunch', 1, 'crouch', { type: 'C', physics: 'S' }),
    crouchpunchHeavy: atk('crouchpunch', 1, 'crouch', { type: 'C', physics: 'S', hd: { damage: { hit: 72, guard: 10 } }, ret: dur('crouchpunch') + 8 }),
    crouchlk: atk('crouchlk', 1, 'crouch', { type: 'C', physics: 'S' }),
    crouchhk: atk('crouchhk', 2, 'crouch', { type: 'C', physics: 'S', hd: { damage: { hit: 70, guard: 10 } } }),
    // Jump attacks are OVERHEADS (guardFlag 'H'): they come from above, so a
    // crouch-block can't stop them — the defender must stand-block (or eat it).
    jumppunch: atk('jumppunch', 1, 'stand', { type: 'A', physics: 'A', land: true, hd: { guardFlag: 'H' } }),
    // Jump LK shares the jump-HK animation (its own art had poor reach); they
    // differ only in power — light = less damage, heavy = more.
    jumplk: atk('jumphk', 1, 'stand', { type: 'A', physics: 'A', land: true, hd: { guardFlag: 'H', damage: { hit: 35, guard: 4 } } }),
    jumphk: atk('jumphk', 1, 'stand', { type: 'A', physics: 'A', land: true, hd: { guardFlag: 'H', damage: { hit: 65, guard: 9 } } }),

    // --- LP+HP two-button specials ---
    punch2h: atk('punch2h', 2, 'stand', { hd: { damage: { hit: 70, guard: 10 }, groundVelocity: { x: 5, y: 0 }, pauseTime: { p1: 12, p2: 12 } } }),
    // Hooks launch the opponent (upward knockback → airborne hit state → crashes
    // into a knockdown), so a clean hook puts them on the ground.
    hook: atk('hook', 2, 'stand', { hd: { damage: { hit: 62, guard: 8 }, groundVelocity: { x: 5, y: 6 }, airVelocity: { x: 4, y: 6 } } }),
    // Uppercut launches harder/higher than the hook (anti-air).
    uppercut: atk('uppercut', 3, 'stand', { hd: { damage: { hit: 80, guard: 10 }, groundVelocity: { x: 2, y: 9 }, airVelocity: { x: 2, y: 9 }, pauseTime: { p1: 12, p2: 14 } } }),
    crouchhook: atk('crouchhook', 2, 'crouch', { type: 'C', physics: 'S', hd: { damage: { hit: 60, guard: 8 }, groundVelocity: { x: 4, y: 5 }, airVelocity: { x: 3, y: 5 } } }),

    // Throw (LP+HP near the opponent): grab → toss them in a parabola behind you.
    throw: {
      type: 'S', moveType: 'A', physics: 'N', anim: 'throwgrab', ctrl: 0, velSet: { x: 0, y: 0 },
      controllers: [
        {
          type: 'Throw',
          // Shoulder throw: the victim is flipped to BEHIND the thrower (negative
          // bindPos.x = back) during the toss, then slammed further back + down, so
          // they end up on the thrower's far side instead of flying through them.
          def: { range: { x: 26, y: 60 }, damage: 90, attackerState: 'throwexec', releaseState: 'tossed', bindTime: 16, bindPos: { x: -34, y: 22 }, throwVel: { x: -4, y: 8 } },
          trigger: le('time', 3),
        },
        { type: 'ChangeState', value: 'stand', ctrl: 1, trigger: ge('time', dur('throwgrab')) },
      ],
    },
    throwexec: {
      type: 'S', moveType: 'A', physics: 'N', anim: 'throwtoss', ctrl: 0, velSet: { x: 0, y: 0 },
      controllers: [{ type: 'ChangeState', value: 'stand', ctrl: 1, trigger: ge('time', dur('throwtoss')) }],
    },

    // Thrown/launched victim reaction: arc through the air in the horizontal
    // flying poses (parabola), land head-first into a knockdown, then get up.
    tossed: {
      type: 'A', moveType: 'H', physics: 'A', anim: 'tossed', ctrl: 0,
      controllers: [{ type: 'ChangeState', value: 'knockdown', trigger: landed() }],
    },
    knockdown: {
      type: 'L', moveType: 'H', physics: 'S', anim: 'kdlie', ctrl: 0, velSet: { x: 0 },
      controllers: [{ type: 'ChangeState', value: 'getup', trigger: ge('time', 24) }],
    },
    getup: {
      type: 'C', moveType: 'I', physics: 'S', anim: 'getup', ctrl: 0, velSet: { x: 0 },
      controllers: [{ type: 'ChangeState', value: 'stand', ctrl: 1, trigger: ge('time', dur('getup')) }],
    },

    // Time-up loss: judged the loser when the clock runs out — slumps into the
    // dizzy stagger (distinct from a KO, where the loser lies knocked out).
    lose: {
      type: 'S', moveType: 'I', physics: 'S', anim: 'dizzy', ctrl: 0, velSet: { x: 0 }, controllers: [],
    },

    // Dizzy/stun: the engine routes the victim here when its stun meter tops out.
    // Stunned and helpless (moveType 'H' = can't act, no guard) for the stun
    // window, then shakes it off back to standing. The opponent can hit freely.
    dizzy: {
      type: 'S', moveType: 'H', physics: 'S', anim: 'dizzy', ctrl: 0, velSet: { x: 0 },
      controllers: [{ type: 'ChangeState', value: 'stand', ctrl: 1, trigger: ge('time', 120) }],
    },

    // Victory pose held during the KO buffer (engine forces the winner here).
    win: { type: 'S', moveType: 'I', physics: 'S', anim: 'win', ctrl: 0, velSet: { x: 0 }, controllers: [] },
    'hit.stand': {
      type: 'S', moveType: 'H', physics: 'S', anim: 'hit', ctrl: 0,
      controllers: [{ type: 'ChangeState', value: 'stand', ctrl: 1, trigger: ge('time', 12) }],
    },
    // Launched victims arc up, then crash into a knockdown (→ getup) instead of
    // landing on their feet — so hooks / uppercuts put the opponent on the floor.
    'hit.air': {
      type: 'A', moveType: 'H', physics: 'A', anim: 'hitair', ctrl: 0,
      controllers: [{ type: 'ChangeState', value: 'knockdown', trigger: landed() }],
    },
    'guard.stand': {
      type: 'S', moveType: 'I', physics: 'S', anim: 'guardstand', ctrl: 0,
      controllers: [{ type: 'ChangeState', value: 'stand', ctrl: 1, trigger: ge('time', 11) }],
    },
    'guard.crouch': {
      type: 'C', moveType: 'I', physics: 'S', anim: 'guardcrouch', ctrl: 0,
      controllers: [{ type: 'ChangeState', value: 'crouch', ctrl: 1, trigger: ge('time', 11) }],
    },
    'guard.air': {
      type: 'A', moveType: 'I', physics: 'A', anim: 'guardstand', ctrl: 0,
      controllers: [{ type: 'ChangeState', value: 'stand', ctrl: 1, trigger: landed() }],
    },
    // KO: knocked out flat on the ground (the lying-on-back frame), held through
    // the KO buffer. NOT the dizzy frame — that's reserved for a time-up loss.
    ko: { type: 'L', moveType: 'I', physics: 'S', anim: 'kdlie', ctrl: 0, controllers: [] },
  };
}

const animations = buildAnimations();

export const KFM2_CHARACTER: Character = parseCharacter({
  meta: { id: 'kfm2', name: 'KFM (full 36-action sheet)', author: 'BrawlBox', version: '0.1.0' },
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
  spriteAtlas: { url: 'kfm2/atlas.png', frames: data.frames },
});
