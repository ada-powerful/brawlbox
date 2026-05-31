// Character config generation: text prompt -> validated Character JSON, with a
// bounded Zod-feedback retry loop. Provider-agnostic — pass any ChatProvider.
import baseChar from '../../characters/base/character.json' with { type: 'json' };
import { parseCharacter } from '../engine/schema.ts';
import {
  buildRetryMessage,
  buildSystemPrompt,
  buildUserPrompt,
  extractJson,
  formatParseError,
} from './prompt.ts';
import type { ChatMessage, ChatProvider, GenerateOptions, GenerateResult, GenSpec } from './types.ts';

/**
 * Generate a valid Character from a text spec.
 *
 * Each attempt: ask the provider, extract JSON, run it through parseCharacter
 * (the Zod schema + reference checks ARE the correctness gate). On failure, feed
 * the formatted error back as a user turn and retry, up to maxAttempts. Throws
 * if no attempt validates.
 */
export async function generateCharacter(
  spec: GenSpec,
  provider: ChatProvider,
  opts: GenerateOptions = {},
): Promise<GenerateResult> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const template = opts.template ?? baseChar;

  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(template) },
    { role: 'user', content: buildUserPrompt(spec) },
  ];

  let lastError = 'unknown error';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const raw = await provider(messages);
    messages.push({ role: 'assistant', content: raw });
    try {
      const json = extractJson(raw);
      const character = parseCharacter(json);
      return { character, json, raw, attempts: attempt };
    } catch (err) {
      lastError = formatParseError(err);
      messages.push({ role: 'user', content: buildRetryMessage(lastError) });
    }
  }

  throw new Error(
    `Failed to generate a valid character after ${maxAttempts} attempt(s). Last error:\n${lastError}`,
  );
}
