// Structured character attributes for "create from attributes" (the alternative
// to a free-text prompt). The player picks sex + body type + physique + martial
// style; these drive BOTH the engine stats/size (deterministically, from the
// chosen template's base) AND the art description fed to image generation.
//
// Design notes:
// - Stats are the template base multiplied by the body-type and physique tables,
//   so a giant master is huge and hits hard, a tiny frail one is small and weak.
// - The MOVESET still comes from the template (the engine freezes states/anims).
//   Physique scales attack power + (for the CPU) how aggressive it is; literally
//   removing moves per tier is a later pass (needs state/command surgery).
// - Martial styles currently all map to the kfm2 template (the only real moveset)
//   with their own art flavor + a small stat tilt; each gets a dedicated template
//   later. `available: false` styles are shown as "coming soon".
import type { Character } from '@/engine/schema.ts';

export type Sex = 'male' | 'female';
export type BodyType = 'tiny' | 'petite' | 'normal' | 'burly' | 'giant';
export type Physique = 'weak' | 'amateur' | 'strong' | 'master';
export type MartialStyle = 'bajiquan' | 'boxing' | 'muaythai' | 'taekwondo' | 'wrestling' | 'wingchun';

export interface Attributes {
  sex: Sex;
  body: BodyType;
  physique: Physique;
  style: MartialStyle;
}

export const DEFAULT_ATTRIBUTES: Attributes = {
  sex: 'male',
  body: 'normal',
  physique: 'strong',
  style: 'bajiquan',
};

// --- Body type: real-world height bucket → engine size + physics tilt. -------
// `heightPx` is the rendered body height (kfm2's normal ≈ 110); width/headY scale
// with it. Lighter builds move faster + jump higher; heavier ones are slower with
// more mass (gravity). hp/atk/def multipliers stack with physique.
interface BodySpec {
  label: string;
  hint: string;
  build: string; // art word
  heightPx: number;
  widthPx: number;
  hp: number;
  atk: number;
  def: number;
  speed: number; // walk + air control
  jump: number; // jump power (inverse-ish gravity)
}
export const BODY: Record<BodyType, BodySpec> = {
  tiny: {
    label: 'Tiny',
    hint: 'under 1m — a child or a pet',
    build: 'child-sized',
    heightPx: 62,
    widthPx: 44,
    hp: 0.5,
    atk: 0.6,
    def: 0.8,
    speed: 1.25,
    jump: 1.2,
  },
  petite: {
    label: 'Petite',
    hint: '1.5–1.7m — slight, agile',
    build: 'petite',
    heightPx: 96,
    widthPx: 52,
    hp: 0.8,
    atk: 0.85,
    def: 0.9,
    speed: 1.15,
    jump: 1.1,
  },
  normal: {
    label: 'Normal',
    hint: '1.7–1.85m — average',
    build: 'average-height',
    heightPx: 110,
    widthPx: 60,
    hp: 1,
    atk: 1,
    def: 1,
    speed: 1,
    jump: 1,
  },
  burly: {
    label: 'Burly',
    hint: '1.85–2.0m — broad, heavy',
    build: 'tall and broad',
    heightPx: 126,
    widthPx: 74,
    hp: 1.3,
    atk: 1.2,
    def: 1.25,
    speed: 0.9,
    jump: 0.9,
  },
  giant: {
    label: 'Giant',
    hint: 'over 2m — towering',
    build: 'towering and massive',
    heightPx: 150,
    widthPx: 90,
    hp: 1.7,
    atk: 1.5,
    def: 1.5,
    speed: 0.8,
    jump: 0.82,
  },
};

// --- Physique: training/condition → combat tier + stat multipliers. ----------
// `tier` is a hook for future move-gating; today it scales attack power and the
// art "build" word, and `aggression` steers the CPU (0 = won't attack).
interface PhysiqueSpec {
  label: string;
  hint: string;
  build: string; // art word
  hp: number;
  atk: number;
  def: number;
  aggression: number; // 0..1, for CPU behavior
  tier: 'none' | 'basic' | 'skilled' | 'master';
}
export const PHYSIQUE: Record<Physique, PhysiqueSpec> = {
  weak: {
    label: 'Frail',
    hint: "won't really fight — low HP, dazed easily",
    build: 'frail and thin',
    hp: 0.45,
    atk: 0.25,
    def: 0.7,
    aggression: 0,
    tier: 'none',
  },
  amateur: {
    label: 'Amateur',
    hint: 'untrained — simple punches & kicks',
    build: 'ordinary',
    hp: 0.85,
    atk: 0.7,
    def: 0.9,
    aggression: 0.4,
    tier: 'basic',
  },
  strong: {
    label: 'Strong',
    hint: 'tough — durable, a broad moveset',
    build: 'muscular and sturdy',
    hp: 1.25,
    atk: 1,
    def: 1.3,
    aggression: 0.75,
    tier: 'skilled',
  },
  master: {
    label: 'Master',
    hint: 'high stamina, devastating techniques',
    build: 'lean, athletic and battle-hardened',
    hp: 1.4,
    atk: 1.6,
    def: 1.2,
    aggression: 1,
    tier: 'master',
  },
};

export const SEX: Record<Sex, { label: string; noun: string }> = {
  male: { label: 'Male', noun: 'man' },
  female: { label: 'Female', noun: 'woman' },
};

// --- Martial styles. Only Bajiquan has a real template/moveset today; the rest
// reuse it with their own art + a small stat tilt until each gets its own. ------
interface StyleSpec {
  label: string;
  /** Selectable now? false → shown as "coming soon". */
  available: boolean;
  /** Template the moveset comes from (kfm2 for all, for now). */
  templateId: string;
  /** Art phrase describing the fighter's discipline + typical attire/stance. */
  art: string;
  /** Small multiplicative stat tilt on top of body × physique. */
  atk?: number;
  def?: number;
  speed?: number;
}
export const STYLE: Record<MartialStyle, StyleSpec> = {
  bajiquan: {
    label: 'Bajiquan',
    available: true,
    templateId: 'kfm2',
    art: 'a Bajiquan martial artist in a grounded close-range stance',
  },
  boxing: {
    label: 'Boxing',
    available: true,
    templateId: 'kfm2',
    art: 'a boxer with raised guard and taped fists',
    atk: 1.1,
    speed: 1.1,
  },
  muaythai: {
    label: 'Muay Thai',
    available: true,
    templateId: 'kfm2',
    art: 'a Muay Thai fighter with elbow and knee strikes, in fight shorts',
    atk: 1.15,
    def: 1.1,
  },
  taekwondo: {
    label: 'Taekwondo',
    available: true,
    templateId: 'kfm2',
    art: 'a Taekwondo practitioner in a dobok, poised for high kicks',
    speed: 1.15,
  },
  wrestling: {
    label: 'Wrestling',
    available: true,
    templateId: 'kfm2',
    art: 'a powerful grappler built for throws and clinches',
    def: 1.2,
    speed: 0.9,
  },
  wingchun: {
    label: 'Wing Chun',
    available: true,
    templateId: 'kfm2',
    art: 'a Wing Chun fighter with a tight centerline guard and rapid chain punches',
    atk: 0.95,
    speed: 1.1,
  },
};

const round = (n: number) => Math.round(n);

/**
 * Apply attributes to a template's base character: scale combat stats by
 * body × physique × style and resize the body to the chosen build. Gameplay
 * (states/anims/commands) is untouched — only data + size change.
 */
export function applyAttributes(base: Character, attrs: Attributes): Character {
  const b = BODY[attrs.body];
  const p = PHYSIQUE[attrs.physique];
  const s = STYLE[attrs.style];
  const height = b.heightPx;
  return {
    ...base,
    data: {
      ...base.data,
      life: round(base.data.life * b.hp * p.hp),
      attack: round(base.data.attack * b.atk * p.atk * (s.atk ?? 1)),
      defence: round(base.data.defence * b.def * p.def * (s.def ?? 1)),
      walkFwd: +(base.data.walkFwd * b.speed * (s.speed ?? 1)).toFixed(2),
      walkBack: +(base.data.walkBack * b.speed * (s.speed ?? 1)).toFixed(2),
      jumpVel: { x: base.data.jumpVel.x, y: +(base.data.jumpVel.y * b.jump).toFixed(2) },
      gravity: +(base.data.gravity * (2 - b.jump)).toFixed(3), // heavier → falls faster
    },
    size: {
      ...base.size,
      width: b.widthPx,
      height,
      headY: round(height * 0.91),
    },
  };
}

/**
 * A one-line appearance description for image generation + naming. `extra` is
 * the user's free-text note (look details the attributes don't cover, e.g.
 * "red lacquered armor and a scar"); when present it's appended to the
 * attribute-derived sentence.
 */
export function attributesToDescription(attrs: Attributes, extra?: string): string {
  const sex = SEX[attrs.sex].noun;
  const body = BODY[attrs.body].build;
  const build = PHYSIQUE[attrs.physique].build;
  const style = STYLE[attrs.style].art;
  const base = `A ${body} ${sex}, ${build}, ${style}.`;
  const note = extra?.trim();
  return note ? `${base} ${note}` : base;
}

/** A sensible default fighter name from the chosen attributes. */
export function attributesToName(attrs: Attributes): string {
  const style = STYLE[attrs.style].label.replace(/\s*\(.*\)$/, '');
  return `${PHYSIQUE[attrs.physique].label} ${style}`;
}
