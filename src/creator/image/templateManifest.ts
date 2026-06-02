// Maps detected template-sheet frames to engine sprite keys. The fal retexture
// preserves the template's ROW layout, so we map by (row index, fractional
// position within the row) rather than absolute frame index — robust to the
// per-row frame-count jitter that auto-detection produces run to run.
import type { PixelBox } from './alpha.ts';

export interface FrameSelector {
  /** 0-based row, top to bottom. */
  row: number;
  /** Position within the row, 0 (first) .. 1 (last). */
  frac: number;
}

// Layout of the MUGEN action template (rows top→bottom), grounded in the detected
// bands of the Kyo reference sheet (13 bands; frame counts in parens):
//   0  idle (5)
//   1  walk fwd/back (6)
//   2  light jump → land (7)
//   3  high jump (4)            — ascent + tuck; descent mirrors ascent
//   4  forward dash / run (6)
//   5  guard (5)                — 0-2 standing guard, 3-4 crouch guard
//   6  punch (6)               — 0-3 standing punch, 4-5 crouch punch (light/heavy share art)
//   7  kick (11)               — 0-2 stand kick, 3-5 crouch kick, 6-7 jump attack, 8-10 charged kick
//   8  charged punch (6)
//   9  hit (10)                — 0-6 standing hit, 7-9 crouch hit
//   10 knockdown (7)           — 0-5 knocked down, 6 get-up
//   11 lying (2)               — KO / on-the-ground (OTG)
//   12 props (6)               — projectiles / fx (unmapped)
// `frac` targets a specific frame index within the row: frac = index / (rowLen - 1).
export const DEFAULT_TEMPLATE_MANIFEST: Record<string, FrameSelector> = {
  // 0 idle
  stand: { row: 0, frac: 0 },
  // 1 walk
  'walk-0': { row: 1, frac: 0.0 },
  'walk-1': { row: 1, frac: 0.4 },
  'walk-2': { row: 1, frac: 0.6 },
  'walk-3': { row: 1, frac: 1.0 },
  // 2 light jump → land
  'jump-rise': { row: 2, frac: 0.167 },
  'jump-fall': { row: 2, frac: 0.667 },
  'jump-land': { row: 2, frac: 1.0 },
  // 3 high jump
  'highjump-rise': { row: 3, frac: 0.333 },
  'highjump-fall': { row: 3, frac: 1.0 },
  // 4 dash / run
  'dash-0': { row: 4, frac: 0.4 },
  'dash-1': { row: 4, frac: 0.8 },
  // 5 guard (0-2 stand, 3-4 crouch)
  'guard-stand': { row: 5, frac: 0.25 },
  'guard-crouch': { row: 5, frac: 1.0 },
  // 6 punch (0-3 stand, 4-5 crouch)
  'punch-startup': { row: 6, frac: 0.0 },
  'punch-active': { row: 6, frac: 0.2 },
  'punch-recovery': { row: 6, frac: 0.6 },
  'crouchpunch-active': { row: 6, frac: 0.8 },
  // 7 kick (0-2 stand, 3-5 crouch, 6-7 jump attack, 8-10 charged)
  'kick-startup': { row: 7, frac: 0.0 },
  'kick-active': { row: 7, frac: 0.1 },
  'kick-recovery': { row: 7, frac: 0.2 },
  'crouchkick-startup': { row: 7, frac: 0.3 },
  'crouchkick-active': { row: 7, frac: 0.4 },
  'crouchkick-recovery': { row: 7, frac: 0.5 },
  jumpattack: { row: 7, frac: 0.6 },
  // Charged kick spans the row's last three frames (8-10): effect, swing, leg-up.
  'kickcharge-startup': { row: 7, frac: 0.8 },
  'kickcharge-active': { row: 7, frac: 0.9 },
  'kickcharge-recovery': { row: 7, frac: 1.0 },
  // 8 charged punch
  'punchcharge-startup': { row: 8, frac: 0.0 },
  'punchcharge-active': { row: 8, frac: 0.4 },
  'punchcharge-recovery': { row: 8, frac: 0.8 },
  // 9 hit (0-6 stand, 7-9 crouch)
  'hit-stand': { row: 9, frac: 0.111 },
  'hit-crouch': { row: 9, frac: 0.889 },
  // 10 knockdown (0-5 down, 6 get-up)
  launch: { row: 10, frac: 0.0 },
  knockdown: { row: 10, frac: 0.333 },
  'lying-flat': { row: 10, frac: 0.833 }, // settled flat-on-back (defeat pose)
  getup: { row: 10, frac: 1.0 },
  // 11 lying / OTG
  lying: { row: 11, frac: 0.0 },
  downed: { row: 11, frac: 1.0 },
  ko: { row: 11, frac: 0.0 },
};

/**
 * Best-effort selector for a sprite key the manifest doesn't list. The model is
 * told to reuse the fixed vocabulary, but if it invents an attack key (e.g.
 * "uppercut-active") we still want a real attack frame, never the idle pose.
 * Returns undefined for keys we can't place (caller then falls back to stand).
 */
export function inferSelector(key: string): FrameSelector | undefined {
  const k = key.toLowerCase();

  // Phase within the move, from a trailing segment.
  let frac = 0.5;
  if (/(?:^|[-_])(?:startup|start|0)$/.test(k)) frac = 0;
  else if (/(?:^|[-_])(?:active|hit|1)$/.test(k)) frac = 0.5;
  else if (/(?:^|[-_])(?:recovery|recover|end|2)$/.test(k)) frac = 0.85;

  // Which template band the name points at. Kick (row 7) is the generic attack
  // band — it has the most frames, so unrecognized attacks land cleanly.
  let row: number | undefined;
  if (/guard|block/.test(k)) row = 5;
  else if (/punch|jab|straight|cross/.test(k)) row = 6;
  else if (/kick|uppercut|special|super|smash|slam|strike|attack|combo|swing|hook/.test(k)) row = 7;
  else if (/dash|run|dodge|roll|rush/.test(k)) row = 4;
  else if (/jump|air|aerial|fall|rise|leap/.test(k)) row = 2;
  else if (/knockdown|down|launch|getup|lying|ko/.test(k)) row = 10;
  else if (/hit|hurt/.test(k)) row = 9;
  else if (/walk|step/.test(k)) row = 1;
  else if (/stand|idle|crouch|duck|low|squat/.test(k)) row = 0;

  return row === undefined ? undefined : { row, frac };
}

/**
 * Group detected frames (ordered top→bottom, left→right) into rows by their
 * y position. A new row starts when a frame's top jumps well past the current
 * row's top.
 */
export function groupIntoRows(frames: PixelBox[]): PixelBox[][] {
  const rows: PixelBox[][] = [];
  let rowTop = -Infinity;
  // Threshold = a fraction of the median frame height (rows are ~1 frame apart).
  const heights = frames.map((f) => f.h).sort((a, b) => a - b);
  const medianH = heights.length ? (heights[Math.floor(heights.length / 2)] ?? 0) : 0;
  const threshold = Math.max(20, medianH * 0.5);

  for (const f of frames) {
    if (f.y > rowTop + threshold || rows.length === 0) {
      rows.push([f]);
      rowTop = f.y;
    } else {
      rows[rows.length - 1]!.push(f);
    }
  }
  // Keep each row left-to-right.
  for (const row of rows) row.sort((a, b) => a.x - b.x);
  return rows;
}

/**
 * Pick the index (into the `detected` array, in detection order) of the frame
 * each requested engine sprite key should use, per the manifest's (row, frac)
 * selectors. Falls back to the stand frame (row 0, first) when a selector's row
 * is missing or a key isn't in the manifest. Returning indices (not boxes) keeps
 * the selection serializable and editable — the frame-review console (M2.3) lets
 * the user override a mis-mapped index without re-deriving anything.
 */
export function selectFrameIndices(
  detected: PixelBox[],
  keys: string[],
  manifest: Record<string, FrameSelector> = DEFAULT_TEMPLATE_MANIFEST,
): Record<string, number> {
  const rows = groupIntoRows(detected);
  // Map each box back to its index in the original detection order.
  const indexOf = new Map<PixelBox, number>();
  detected.forEach((box, i) => indexOf.set(box, i));

  const fallback = rows[0]?.[0] ?? detected[0];

  const pick = (sel: FrameSelector | undefined): PixelBox | undefined => {
    if (!sel) return fallback;
    const row = rows[sel.row];
    if (!row || row.length === 0) return fallback;
    const idx = Math.min(row.length - 1, Math.max(0, Math.round(sel.frac * (row.length - 1))));
    return row[idx];
  };

  const out: Record<string, number> = {};
  for (const key of keys) {
    // Unmapped keys get a name-based guess before falling back to the idle pose.
    const box = pick(manifest[key] ?? inferSelector(key));
    if (box === undefined) continue;
    const i = indexOf.get(box);
    if (i !== undefined) out[key] = i;
  }
  return out;
}

/**
 * Pick a PixelBox for each requested engine sprite key using the manifest.
 * Thin wrapper over {@link selectFrameIndices} for callers that want boxes.
 */
export function selectFrames(
  detected: PixelBox[],
  keys: string[],
  manifest: Record<string, FrameSelector> = DEFAULT_TEMPLATE_MANIFEST,
): Record<string, PixelBox> {
  const indices = selectFrameIndices(detected, keys, manifest);
  const out: Record<string, PixelBox> = {};
  for (const [key, i] of Object.entries(indices)) {
    const box = detected[i];
    if (box) out[key] = box;
  }
  return out;
}
