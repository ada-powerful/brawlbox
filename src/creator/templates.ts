// Character templates the creator can pick from. A "template" is a complete,
// hand-tuned base character (state machine, animations, hitboxes, AI) paired
// with a green-screen layout sheet in S3 that NB2 (nano-banana-2) re-skins. The
// new fighter REUSES the template's gameplay wholesale and only swaps the art —
// the user's prompt drives the look, not the moveset (see HANDOFF / project
// memory). The dropdown shows a friendly label only; template internals (which
// reference character, which S3 key, the grid spec) stay hidden.
//
// Roadmap: instead of picking a template by name, the user will pick gender +
// body type + martial-arts style, and those parameters will map to a template
// id here. The registry shape is built for that — add templates and a selector.
import type { Character } from '@/engine/schema.ts';
import { KFM2_CHARACTER } from '@/sandbox/kfm2.ts';
import { KFM2LITE_CHARACTER } from '@/sandbox/kfm2lite.ts';
import kfm2TemplateRaw from '@/sandbox/kfm2-template.json' with { type: 'json' };
import kfm2liteTemplateRaw from '@/sandbox/kfm2lite-template.json' with { type: 'json' };
import type { GridTemplateSpec } from '@/creator/image/sliceGrid.ts';
import type { RGB } from '@/creator/image/alpha.ts';

interface TemplateJson {
  grid: { cols: number; rows: number };
  /** "col,row" -> engine sprite key. */
  cellMap: Record<string, string>;
}

export interface CharacterTemplate {
  id: string;
  /** Friendly, internals-hidden label for the creator dropdown. */
  label: string;
  /** One-line hint shown under the dropdown. */
  hint: string;
  /** S3 key the backend retextures (sent as `templateKey` to /generate/sprites). */
  backendTemplateKey: string;
  /** Base character whose state machine / anims / timings the fighter reuses. */
  base: Character;
  /** Grid structure (rows/cols + cell map) used to map detected poses to keys. */
  grid: GridTemplateSpec;
  /** Background color to key out of the retextured sheet (the green screen). */
  bg: RGB;
}

/** Reverse a template json's "col,row"→key map into key→{col,row}. */
function gridSpec(raw: unknown): GridTemplateSpec {
  const t = raw as TemplateJson;
  const cells: Record<string, { col: number; row: number }> = {};
  for (const [cr, key] of Object.entries(t.cellMap)) {
    const [col, row] = cr.split(',').map(Number);
    if (col !== undefined && row !== undefined) cells[key] = { col, row };
  }
  return { cols: t.grid.cols, rows: t.grid.rows, cells };
}

export const TEMPLATES: CharacterTemplate[] = [
  {
    id: 'kfm2',
    label: 'Bajiquan Brawler',
    hint: 'A close-range martial artist with 36 hand-tuned moves. Your description sets the look.',
    backendTemplateKey: 'templates/kfm2.png',
    base: KFM2_CHARACTER,
    grid: gridSpec(kfm2TemplateRaw),
    bg: { r: 0, g: 255, b: 0 }, // chroma-green screen
  },
  {
    id: 'kfm2lite',
    label: 'Bajiquan Brawler (Lite)',
    hint: 'A leaner 26-move brawler on a roomier sheet — cleaner art, sharper faces. Your description sets the look.',
    backendTemplateKey: 'templates/kfm2lite.png',
    base: KFM2LITE_CHARACTER,
    grid: gridSpec(kfm2liteTemplateRaw),
    bg: { r: 0, g: 255, b: 0 }, // chroma-green screen
  },
];

/** Sentinel for the legacy "let the AI design a fresh character" path. */
export const FREEFORM_ID = 'freeform';
export const DEFAULT_TEMPLATE_ID = TEMPLATES[0]?.id ?? FREEFORM_ID;

export function getTemplate(id: string): CharacterTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
