// Canonical action vocabulary + procedural poses.
//
// This is the shared "basic action" set the engine's moves map onto. Two payoffs:
//   1. Testability now — a character WITHOUT sprite art renders a distinct,
//      colour-coded silhouette per action, so you can tell a headbutt from a
//      block from a throw at a glance in the sandbox.
//   2. Art mapping later — real character sprites (hand-drawn or NB2-generated)
//      are authored one-per-canonical-action, so any character slots into the
//      same vocabulary. `actionGroup()` also pattern-matches ad-hoc anim ids
//      (e.g. `standHP`, `special.slap`) so existing characters classify for free.
//
// Pure module: no Pixi/DOM. The renderer turns a `FrameShape` into geometry.

export type ActionGroup =
  | 'movement'
  | 'attack'
  | 'special'
  | 'super'
  | 'throw'
  | 'guard'
  | 'hurt'
  | 'thrown'
  | 'system';

export interface CanonicalAction {
  id: string;
  group: ActionGroup;
  description: string;
}

/**
 * The canonical action set. Authoring/art target: a fully-realised character
 * provides one animation per id here (plus any character-specific extras, which
 * still classify via `actionGroup`). Grouped by `ActionGroup`.
 */
export const CANONICAL_ACTIONS: readonly CanonicalAction[] = [
  // Movement / neutral
  { id: 'stand', group: 'movement', description: 'Neutral idle' },
  { id: 'walk', group: 'movement', description: 'Walk forward/back' },
  { id: 'crouch', group: 'movement', description: 'Crouching idle' },
  { id: 'jump.rise', group: 'movement', description: 'Ascending jump' },
  { id: 'jump.fall', group: 'movement', description: 'Descending jump' },
  { id: 'dash', group: 'movement', description: 'Ground dash' },
  { id: 'run', group: 'movement', description: 'Run' },
  { id: 'land', group: 'movement', description: 'Landing recovery' },
  // Attacks (stance × strength)
  { id: 'stand.light', group: 'attack', description: 'Standing light' },
  { id: 'stand.medium', group: 'attack', description: 'Standing medium' },
  { id: 'stand.heavy', group: 'attack', description: 'Standing heavy' },
  { id: 'crouch.light', group: 'attack', description: 'Crouching light' },
  { id: 'crouch.medium', group: 'attack', description: 'Crouching medium' },
  { id: 'crouch.heavy', group: 'attack', description: 'Crouching heavy' },
  { id: 'air.light', group: 'attack', description: 'Jumping light' },
  { id: 'air.medium', group: 'attack', description: 'Jumping medium' },
  { id: 'air.heavy', group: 'attack', description: 'Jumping heavy' },
  // Specials & supers (generic categories; the exact motion is per-character)
  { id: 'special', group: 'special', description: 'Ground special' },
  { id: 'special.air', group: 'special', description: 'Air special' },
  { id: 'super', group: 'super', description: 'Super / hyper' },
  // Throws
  { id: 'throw', group: 'throw', description: 'Throw / command-grab startup+active' },
  { id: 'thrown', group: 'thrown', description: 'Being held / thrown (victim)' },
  // Defense
  { id: 'guard.stand', group: 'guard', description: 'Standing block' },
  { id: 'guard.crouch', group: 'guard', description: 'Crouching block' },
  { id: 'guard.air', group: 'guard', description: 'Air block' },
  // Hurt / knockdown
  { id: 'hit.stand', group: 'hurt', description: 'Standing hit reaction' },
  { id: 'hit.crouch', group: 'hurt', description: 'Crouching hit reaction' },
  { id: 'hit.air', group: 'hurt', description: 'Airborne hit reaction' },
  { id: 'fall', group: 'hurt', description: 'Knocked into the air, falling' },
  // System
  { id: 'ko', group: 'system', description: 'Knocked out' },
  { id: 'win', group: 'system', description: 'Win pose' },
  { id: 'taunt', group: 'system', description: 'Taunt' },
  { id: 'intro', group: 'system', description: 'Round intro' },
] as const;

/** Group → silhouette colour (movement uses the player tint, so it's excluded here). */
export const GROUP_COLORS: Record<Exclude<ActionGroup, 'movement'>, number> = {
  attack: 0xffffff,
  special: 0xff9933,
  super: 0xffd34d,
  throw: 0x44dd88,
  guard: 0x3399ff,
  hurt: 0xff5555,
  thrown: 0xbb66ff,
  system: 0x888888,
};

/**
 * Classify any anim id (canonical or ad-hoc) into an `ActionGroup`. Order is
 * deliberate: `thrown` before `throw` (it contains the substring), specials
 * before the generic attack check, etc.
 */
export function actionGroup(animId: string): ActionGroup {
  const a = animId.toLowerCase();
  if (a.includes('guard') || a.includes('block')) return 'guard';
  if (a.includes('thrown')) return 'thrown';
  if (a.includes('throw') || a.includes('grab') || a.includes('oicho')) return 'throw';
  if (a.includes('super') || a.includes('hyper')) return 'super';
  if (
    a.includes('special') ||
    a.includes('headbutt') ||
    a.includes('slap') ||
    a.includes('splash') ||
    a.includes('fireball') ||
    a.includes('projectile') ||
    a.includes('.dp') ||
    a.includes('qcf')
  ) {
    return 'special';
  }
  if (a.startsWith('hit') || a.includes('hurt') || a === 'fall') return 'hurt';
  if (
    a === 'ko' ||
    a.includes('win') ||
    a.includes('taunt') ||
    a.includes('intro') ||
    a.includes('down') ||
    a.includes('getup')
  ) {
    return 'system';
  }
  if (isAttack(a)) return 'attack';
  return 'movement';
}

function isAttack(a: string): boolean {
  if (
    a.includes('punch') ||
    a.includes('kick') ||
    a.includes('light') ||
    a.includes('medium') ||
    a.includes('heavy')
  ) {
    return true;
  }
  // Tier-coded normals (standLP, crouchHK, jumpLP, air.lk). Require a stance
  // prefix so plain words that happen to end in a tier code — e.g. "walk"
  // ends with "lk" — aren't misread as attacks.
  if (!/(lp|mp|hp|lk|mk|hk)$/.test(a)) return false;
  return a.includes('stand') || a.includes('crouch') || a.includes('jump') || a.includes('air');
}

/** A procedural silhouette: a body trapezoid plus an optional forward "limb" bar. */
export interface FrameShape {
  /** Body width at the shoulders. */
  w: number;
  /** Body height. */
  h: number;
  /** Horizontal lean of the top edge (+ = forward in facing dir). */
  leanX: number;
  /** Fill colour. */
  color: number;
  /** Forward limb extension (0 = none) — visualises strikes / grabs / guards. */
  arm: number;
}

/** Map an anim id + frame to a distinct, colour-coded silhouette for the renderer. */
export function poseFor(animId: string, frame: number, baseColor: number): FrameShape {
  const a = animId.toLowerCase();
  const group = actionGroup(a);
  const color = group === 'movement' ? baseColor : GROUP_COLORS[group];

  switch (group) {
    case 'movement':
      return movementPose(a, frame, color);
    case 'attack':
      return attackPose(a, frame, color);
    case 'special':
      return a.includes('splash') || a.includes('air')
        ? { w: 92, h: 72, leanX: 6, color, arm: 30 }
        : { w: 66, h: 100, leanX: 16, color, arm: 54 };
    case 'super':
      return { w: 90, h: 106, leanX: 18, color, arm: 64 };
    case 'throw':
      return { w: 64, h: 100, leanX: 8, color, arm: 46 };
    case 'guard':
      return a.includes('crouch')
        ? { w: 66, h: 60, leanX: -6, color, arm: 16 }
        : a.includes('air')
          ? { w: 58, h: 92, leanX: -6, color, arm: 16 }
          : { w: 60, h: 100, leanX: -6, color, arm: 16 };
    case 'hurt':
      if (a === 'fall') return { w: 86, h: 50, leanX: -24, color, arm: 0 }; // tumbling, near-horizontal
      if (a.includes('air')) return { w: 52, h: 92, leanX: -18, color, arm: 0 }; // airborne recoil
      if (a.includes('crouch')) return { w: 64, h: 58, leanX: -10, color, arm: 0 };
      return { w: 60, h: 96, leanX: -12, color, arm: 0 }; // hit.stand
    case 'thrown':
      return { w: 64, h: 78, leanX: -20, color, arm: 0 };
    case 'system':
      if (a === 'ko') return { w: 100, h: 30, leanX: 0, color, arm: 0 };
      if (a.includes('win')) return { w: 58, h: 106, leanX: -6, color, arm: 24 };
      if (a.includes('taunt')) return { w: 64, h: 96, leanX: 8, color, arm: 30 };
      return { w: 60, h: 100, leanX: 0, color, arm: 0 }; // intro / default
  }
}

function movementPose(a: string, frame: number, color: number): FrameShape {
  if (a.includes('jump')) {
    return a.includes('fall')
      ? { w: 74, h: 86, leanX: 4, color, arm: 0 }
      : { w: 46, h: 112, leanX: 0, color, arm: 0 };
  }
  if (a === 'crouch') return { w: 64, h: 60, leanX: 0, color, arm: 0 };
  if (a === 'dash') return { w: 82, h: 84, leanX: 22, color, arm: 0 }; // low forward burst
  if (a === 'run') return { w: 54, h: 104, leanX: 10, color, arm: 0 }; // tall upright stride
  if (a === 'land') return { w: 76, h: 70, leanX: 0, color, arm: 0 }; // squashed on touchdown
  if (a === 'walk') return { w: 60, h: 100, leanX: frame === 0 ? -5 : 5, color, arm: 0 };
  return { w: 60, h: 100, leanX: 0, color, arm: 0 }; // stand / default
}

function attackPose(a: string, frame: number, color: number): FrameShape {
  const heavy = a.includes('heavy') || a.endsWith('hp') || a.endsWith('hk');
  const light = a.includes('light') || a.endsWith('lp') || a.endsWith('lk');
  const stance = a.includes('crouch')
    ? 'crouch'
    : a.includes('jump') || a.includes('air')
      ? 'air'
      : 'stand';
  // Tier drives reach/lean/width so light vs medium vs heavy read clearly apart.
  const reach = heavy ? 66 : light ? 24 : 44;
  const lean = heavy ? 14 : light ? 4 : 9;
  const w = heavy ? 68 : light ? 54 : 60;
  // Stance drives height (air sits between crouch and stand; the gallery also
  // lifts airborne actions off the ground so they don't overlap standing ones).
  const h = stance === 'crouch' ? 60 : stance === 'air' ? 92 : 100;
  // The limb extends on the active frame (1) and is tucked on startup/recovery.
  const arm = frame === 1 ? reach : reach * 0.35;
  return { w, h, leanX: lean, color, arm };
}
