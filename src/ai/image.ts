// Browser-direct sprite generation via the OpenAI images API (BYOK). One
// reference frame is generated first; every other pose is an *edit* of that
// reference, which keeps the character design consistent across frames without
// any training/rigs (the zero-shot approach the project validated).
import type { Character } from '../engine/schema.ts';
import { collectReferencedSprites } from '../runtime/atlas.ts';

export type BackgroundMode = 'transparent' | 'chroma';

/** Chroma-key color used when a model can't emit a transparent background. */
export const CHROMA = { r: 0xff, g: 0x00, b: 0xff }; // magenta — rare in characters
const CHROMA_HEX = '#FF00FF';

export interface ImageGenOptions {
  /** Image model. Defaults to gpt-image-2; gpt-image-1 also works. */
  model?: string;
  size?: '1024x1024' | '1024x1536' | '1536x1024' | 'auto';
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Visual style hint, e.g. "inked comic", "pixel art". */
  style?: string;
  /**
   * How the cutout is produced. 'transparent' uses the API's transparent
   * background (gpt-image-1). 'chroma' generates on a flat magenta backdrop to
   * be keyed out client-side (gpt-image-2, which rejects transparent). Defaults
   * to `defaultBackgroundForModel(model)`.
   */
  background?: BackgroundMode;
  /** Called after each frame so the UI can show progress. */
  onProgress?: (done: number, total: number, key: string) => void;
}

/** gpt-image-1 supports transparent output; other models get chroma-keyed. */
export function defaultBackgroundForModel(model: string): BackgroundMode {
  return model.includes('gpt-image-1') ? 'transparent' : 'chroma';
}

interface ImagesResponse {
  data?: { b64_json?: string }[];
}

// Per-pose direction for the base character's sprite keys. Unknown keys fall
// back to a generic description derived from the key.
const POSE: Record<string, string> = {
  stand: 'standing idle in a neutral fighting stance',
  'walk-0': 'walking, left leg forward, mid-stride',
  'walk-1': 'walking, right leg forward, mid-stride',
  'jump-rise': 'jumping upward, knees tucked, arms raised',
  'jump-fall': 'falling downward, legs apart, arms out',
  'punch-startup': 'winding up a punch, fist pulled back',
  'punch-active': 'throwing a straight punch, arm fully extended forward',
  'punch-recovery': 'recovering after a punch, arm half-retracted',
  'hit-stand': 'recoiling from a hit, leaning back, still standing',
  'hit-air': 'knocked into the air, body tilted horizontal',
  ko: 'knocked out, lying on the ground',
};

function posePrompt(key: string): string {
  return POSE[key] ?? `${key.replace(/[-.]/g, ' ')} pose`;
}

function basePrompt(description: string, style: string | undefined, bg: BackgroundMode): string {
  const styleLine = style ? ` Art style: ${style}.` : '';
  const bgLine =
    bg === 'transparent'
      ? ' Transparent background.'
      : ` Place the character on a solid flat ${CHROMA_HEX} magenta background that completely fills the frame; do not use this magenta anywhere on the character itself.`;
  return (
    `2D fighting-game character sprite of ${description}.${styleLine}` +
    ' Full body, facing right, centered in frame, feet at the bottom edge.' +
    bgLine +
    ' Clean flat colors, crisp outline, no drop shadow, no ground, no text.'
  );
}

function b64ToBlob(b64: string): Blob {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: 'image/png' });
}

function firstImage(json: ImagesResponse): Blob {
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error('Image API returned no image data');
  return b64ToBlob(b64);
}

type ResolvedOpts = Required<
  Pick<ImageGenOptions, 'model' | 'size' | 'baseUrl' | 'fetchImpl' | 'background'>
>;

/** Generate the reference frame from scratch. */
async function generate(apiKey: string, prompt: string, opts: ResolvedOpts): Promise<Blob> {
  const body: Record<string, unknown> = {
    model: opts.model,
    prompt,
    size: opts.size,
    output_format: 'png',
    n: 1,
  };
  if (opts.background === 'transparent') body.background = 'transparent';

  const res = await opts.fetchImpl(`${opts.baseUrl}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Image generation failed (${res.status}): ${await res.text()}`);
  return firstImage((await res.json()) as ImagesResponse);
}

/** Edit the reference frame into a new pose, preserving the character design. */
async function edit(
  apiKey: string,
  reference: Blob,
  prompt: string,
  opts: ResolvedOpts,
): Promise<Blob> {
  const form = new FormData();
  form.append('model', opts.model);
  form.append('prompt', prompt);
  form.append('size', opts.size);
  if (opts.background === 'transparent') form.append('background', 'transparent');
  form.append('output_format', 'png');
  form.append('n', '1');
  form.append('image', reference, 'reference.png');

  const res = await opts.fetchImpl(`${opts.baseUrl}/images/edits`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` }, // no Content-Type; FormData sets the boundary
    body: form,
  });
  if (!res.ok) throw new Error(`Image edit failed (${res.status}): ${await res.text()}`);
  return firstImage((await res.json()) as ImagesResponse);
}

/**
 * Generate one sprite Blob per referenced sprite key. The "stand" frame (or the
 * first key) is the reference; the rest are reference-conditioned edits. Runs
 * sequentially to stay within rate limits and report progress.
 */
export async function generateCharacterSprites(
  character: Character,
  description: string,
  apiKey: string,
  options: ImageGenOptions = {},
): Promise<Record<string, Blob>> {
  const keys = collectReferencedSprites(character);
  if (keys.length === 0) throw new Error('Character has no sprites to generate');

  const model = options.model ?? 'gpt-image-2';
  const opts: ResolvedOpts = {
    model,
    size: options.size ?? '1024x1024',
    baseUrl: options.baseUrl ?? 'https://api.openai.com/v1',
    background: options.background ?? defaultBackgroundForModel(model),
    // Bind so it stays callable as opts.fetchImpl(...) — an unbound window.fetch
    // invoked as a method throws "Illegal invocation".
    fetchImpl: (options.fetchImpl ?? fetch).bind(globalThis),
  };

  const preamble = basePrompt(description, options.style, opts.background);
  const refKey = keys.includes('stand') ? 'stand' : keys[0]!;

  const out: Record<string, Blob> = {};
  let done = 0;

  const reference = await generate(apiKey, `${preamble} Pose: ${posePrompt(refKey)}.`, opts);
  out[refKey] = reference;
  options.onProgress?.(++done, keys.length, refKey);

  for (const key of keys) {
    if (key === refKey) continue;
    const prompt =
      `${preamble} Pose: ${posePrompt(key)}.` +
      ' Keep the exact same character design, colors, and proportions as the reference image.';
    out[key] = await edit(apiKey, reference, prompt, opts);
    options.onProgress?.(++done, keys.length, key);
  }

  return out;
}
