// Backend-proxied character generation. The OpenAI key lives on the server
// (Secrets Manager); the browser sends only the spec. Used when VITE_API_BASE_URL
// is set; otherwise the app falls back to BYOK (createOpenAIProvider). This is
// the path that keeps provider keys off the client (HANDOFF §5/§6).
import { parseCharacter, type Character } from '../engine/schema.ts';
import type { GenSpec } from './types.ts';

export interface BackendGenerateResult {
  character: Character;
  attempts: number;
}

export async function generateCharacterViaBackend(
  baseUrl: string,
  spec: GenSpec,
  token?: string | null,
): Promise<BackendGenerateResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}/generate/character`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ prompt: spec.prompt, name: spec.name }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let detail = text;
    try {
      detail = (JSON.parse(text) as { detail?: string; error?: string }).detail ?? text;
    } catch {
      /* not JSON — use the raw text */
    }
    throw new Error(`Character generation failed (${res.status})${detail ? `: ${detail}` : ''}`);
  }

  const data = (await res.json()) as { character?: unknown; attempts?: number };
  // Re-validate client-side so a stale/bad server response can't slip an
  // invalid Character into the engine.
  const character = parseCharacter(data.character);
  return { character, attempts: data.attempts ?? 1 };
}
