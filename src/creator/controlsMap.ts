// Derives a human-readable "frames ↔ buttons" map from a character's state
// machine. Pure module (no React/DOM) so it stays testable: it walks every
// state's ChangeState controllers, pulls the button/command parts out of each
// trigger AST, and groups the resulting actions into player-driven inputs vs
// passive (automatic / reaction) actions.
//
// Keys shown are the P1 keyboard bindings (see src/input/keyboard.ts) — the
// creator's playtest always puts the human on P1, so these are the literal
// keys to press.

import type { Character, State, Trigger } from '@/engine/schema.ts';
import { actionGroup, type ActionGroup } from '@/render/poses.ts';

// The anim-id text heuristic misses attacks whose name carries no tell (e.g.
// `hk`, `hook`, `uppercut`). A state's `moveType: 'A'` is the authoritative
// "this is an attack" signal, so prefer it when the text classifier guessed
// the catch-all 'movement'.
function groupFor(animId: string, state: State | undefined): ActionGroup {
  const g = actionGroup(animId);
  if (g === 'movement' && state?.moveType === 'A') return 'attack';
  return g;
}

/** Abstract engine button → the P1 keyboard key that produces it. */
const P1_KEYS: Record<string, string> = {
  up: 'W',
  down: 'S',
  left: 'A',
  right: 'D',
  a: 'J',
  b: 'K',
  c: 'L',
  x: 'U',
  y: 'I',
  z: 'O',
};

/** Motion-token (commands.ts) → arrow glyph, for rendering command motions. */
const MOTION_ARROWS: Record<string, string> = {
  F: '→',
  B: '←',
  U: '↑',
  D: '↓',
  UF: '↗',
  UB: '↖',
  DF: '↘',
  DB: '↙',
  N: '·',
};

function motionToArrows(motion: string): string {
  return motion
    .split(',')
    .map((step) => MOTION_ARROWS[step.trim()] ?? step.trim())
    .join('');
}

/** The input ingredients pulled out of one trigger AST. */
export interface InputDesc {
  /** Keys to hold/press, e.g. ['U', 'O']. */
  keys: string[];
  /** Named motion commands, pre-rendered, e.g. ['→→ dash']. */
  cmds: string[];
  /** Keys that must be RELEASED (charge moves), e.g. ['U']. */
  release: string[];
  /** Extra conditions surfaced in friendly text, e.g. ['when close']. */
  conditions: string[];
}

function emptyDesc(): InputDesc {
  return { keys: [], cmds: [], release: [], conditions: [] };
}

/**
 * Does this describe a player-INITIATED action? A press or command counts; a
 * release-only trigger does not — `not(button)` edges are the return-to-neutral
 * paths (stop walking, end a charge), which are passive, not actions you press.
 */
function hasInput(d: InputDesc): boolean {
  return d.keys.length > 0 || d.cmds.length > 0;
}

type Comparison = Extract<Trigger, { left: unknown; right: unknown }>;

/** Surface only conditions a player can reason about; suppress internal timing. */
function describeComparison(t: Comparison): string | null {
  const ref = 'ref' in t.left ? t.left.ref : 'ref' in t.right ? t.right.ref : undefined;
  switch (ref) {
    case 'p2BodyDist':
    case 'p2Dist.x':
      return t.op === 'le' || t.op === 'lt' ? 'when close' : 'when far';
    case 'power':
      return 'needs meter';
    case 'time':
      // A time gate on an input transition (e.g. a charge move) reads as "hold".
      return t.op === 'ge' || t.op === 'gt' ? 'hold' : null;
    default:
      return null;
  }
}

/** Recursively pull the input ingredients out of a trigger into `out`. */
function collect(trig: Trigger, character: Character, out: InputDesc): void {
  switch (trig.op) {
    case 'button':
      out.keys.push(P1_KEYS[trig.held] ?? trig.held.toUpperCase());
      return;
    case 'command': {
      const cmd = (character.commands ?? []).find((c) => c.name === trig.name);
      out.cmds.push(cmd ? `${motionToArrows(cmd.motion)} ${trig.name}` : trig.name);
      return;
    }
    case 'and':
      for (const arg of trig.args) collect(arg, character, out);
      return;
    case 'or':
      // All-button alternatives collapse to one "U/O" token; otherwise approximate
      // by merging (the row still surfaces every key involved).
      if (trig.args.every((a) => a.op === 'button')) {
        out.keys.push(
          trig.args
            .map((a) => (a.op === 'button' ? (P1_KEYS[a.held] ?? a.held.toUpperCase()) : ''))
            .join('/'),
        );
        return;
      }
      for (const arg of trig.args) collect(arg, character, out);
      return;
    case 'not':
      if (trig.arg.op === 'button') {
        out.release.push(P1_KEYS[trig.arg.held] ?? trig.arg.held.toUpperCase());
      }
      return;
    case 'eq':
    case 'ne':
    case 'lt':
    case 'le':
    case 'gt':
    case 'ge': {
      const c = describeComparison(trig);
      if (c) out.conditions.push(c);
      return;
    }
    default:
      return;
  }
}

/** One way to enter an action: the source state plus the input that does it. */
export interface InputVariant extends InputDesc {
  /** State the player is in when this input applies ('stand' = neutral). */
  from: string;
}

/** A single action in the map: its animation, frames, and how it's reached. */
export interface ControlRow {
  /** State id (the action). */
  id: string;
  /** Animation id the state plays (falls back to the state id). */
  animId: string;
  /** Sprite keys for each frame of that animation, in order. */
  frames: string[];
  group: ActionGroup;
  /** Player inputs that trigger it (empty ⇒ passive/automatic). */
  inputs: InputVariant[];
}

export interface ControlsMap {
  /** Actions the player triggers with a key/command. */
  inputs: ControlRow[];
  /** Idle / reaction / match-flow actions that play automatically. */
  passive: ControlRow[];
}

const variantSig = (v: InputVariant): string =>
  [v.from, v.keys.join('+'), v.cmds.join('+'), v.release.join('+'), v.conditions.join('+')].join(
    '|',
  );

// Group sort order so the table reads movement → offense → defense → reactions.
const GROUP_ORDER: ActionGroup[] = [
  'movement',
  'attack',
  'special',
  'super',
  'throw',
  'guard',
  'hurt',
  'thrown',
  'system',
];

function byGroupThenId(a: ControlRow, b: ControlRow): number {
  const ga = GROUP_ORDER.indexOf(a.group);
  const gb = GROUP_ORDER.indexOf(b.group);
  return ga !== gb ? ga - gb : a.id.localeCompare(b.id);
}

/**
 * Build the frames↔buttons map for a character. Every state becomes a row; a row
 * is an "input" action if any ChangeState transition into it carries a button or
 * command, otherwise it's "passive" (idle, hit reactions, KO/win, etc.).
 * Animations declared but unused by any state are appended as passive
 * display-only rows so the map covers the whole sheet.
 */
export function buildControlsMap(character: Character): ControlsMap {
  const anims = character.animations ?? {};

  const framesFor = (animId: string): string[] => anims[animId]?.frames.map((f) => f.sprite) ?? [];

  // target state id → the input variants that reach it.
  const variants = new Map<string, InputVariant[]>();
  for (const [from, state] of Object.entries(character.states)) {
    for (const ctrl of state.controllers) {
      if (ctrl.type !== 'ChangeState') continue;
      const desc = emptyDesc();
      collect(ctrl.trigger, character, desc);
      if (!hasInput(desc)) continue;
      const variant: InputVariant = { from, ...desc };
      const list = variants.get(ctrl.value) ?? [];
      if (!list.some((v) => variantSig(v) === variantSig(variant))) list.push(variant);
      variants.set(ctrl.value, list);
    }
  }

  const inputs: ControlRow[] = [];
  const passive: ControlRow[] = [];
  for (const [id, state] of Object.entries(character.states)) {
    const animId = state.anim ?? id;
    const row: ControlRow = {
      id,
      animId,
      frames: framesFor(animId),
      group: groupFor(animId, state),
      inputs: variants.get(id) ?? [],
    };
    (row.inputs.length > 0 ? inputs : passive).push(row);
  }

  // Animations never bound to a state — surface them as display-only passives.
  const usedAnims = new Set(Object.values(character.states).map((s) => s.anim ?? ''));
  for (const animId of Object.keys(anims)) {
    if (usedAnims.has(animId)) continue;
    passive.push({
      id: animId,
      animId,
      frames: framesFor(animId),
      group: groupFor(animId, undefined),
      inputs: [],
    });
  }

  inputs.sort(byGroupThenId);
  passive.sort(byGroupThenId);
  return { inputs, passive };
}
