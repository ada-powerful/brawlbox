import { describe, expect, test } from 'vitest';
import { generateCharacter } from '../src/ai/llm.ts';
import { extractJson, formatParseError } from '../src/ai/prompt.ts';
import { CharacterSchema } from '../src/engine/schema.ts';
import type { ChatMessage, ChatProvider } from '../src/ai/types.ts';

// Minimal character that passes parseCharacter (no animation/command refs to resolve).
const GOOD = {
  meta: { id: 'x', name: 'X', author: 'a', version: '1' },
  data: {
    life: 1000,
    attack: 100,
    defence: 100,
    walkFwd: 3,
    walkBack: -2,
    jumpVel: { x: 0, y: 9 },
    gravity: 0.5,
    groundFriction: 0.85,
  },
  size: { width: 60, height: 100, headY: 92 },
  states: { stand: { type: 'S', moveType: 'I', physics: 'S', controllers: [] } },
};
const GOOD_JSON = JSON.stringify(GOOD);

/** Provider that replays a fixed response list (last entry repeats) and records calls. */
function mockProvider(responses: string[]): { provider: ChatProvider; calls: ChatMessage[][] } {
  let i = 0;
  const calls: ChatMessage[][] = [];
  const provider: ChatProvider = async (messages) => {
    calls.push(messages.map((m) => ({ ...m })));
    const idx = Math.min(i, responses.length - 1);
    i++;
    return responses[idx]!;
  };
  return { provider, calls };
}

const spec = { prompt: 'a test fighter' };

describe('generateCharacter retry loop', () => {
  test('succeeds on the first attempt with clean JSON', async () => {
    const { provider, calls } = mockProvider([GOOD_JSON]);
    const res = await generateCharacter(spec, provider);
    expect(res.attempts).toBe(1);
    expect(res.character.meta.id).toBe('x');
    expect(calls).toHaveLength(1);
  });

  test('recovers from non-JSON, then converges', async () => {
    const { provider } = mockProvider(['Sure! here you go (oops, no json)', GOOD_JSON]);
    const res = await generateCharacter(spec, provider);
    expect(res.attempts).toBe(2);
  });

  test('recovers from Zod-invalid JSON by feeding the error back', async () => {
    const { provider, calls } = mockProvider(['{"meta":{}}', GOOD_JSON]);
    const res = await generateCharacter(spec, provider);
    expect(res.attempts).toBe(2);
    // The 2nd call must include the assistant's bad output AND a retry user turn.
    const secondCall = calls[1]!;
    const lastTurn = secondCall[secondCall.length - 1]!;
    expect(lastTurn.role).toBe('user');
    expect(lastTurn.content).toMatch(/invalid/i);
    expect(secondCall.some((m) => m.role === 'assistant')).toBe(true);
  });

  test('extracts JSON wrapped in a markdown fence', async () => {
    const { provider } = mockProvider(['```json\n' + GOOD_JSON + '\n```']);
    const res = await generateCharacter(spec, provider);
    expect(res.attempts).toBe(1);
  });

  test('throws after exhausting maxAttempts, reporting the last error', async () => {
    const { provider, calls } = mockProvider(['{"meta":{}}']);
    await expect(generateCharacter(spec, provider, { maxAttempts: 2 })).rejects.toThrow(
      /after 2 attempt/i,
    );
    expect(calls).toHaveLength(2);
  });
});

describe('extractJson', () => {
  test('parses bare JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  test('strips surrounding prose by taking the outer braces', () => {
    expect(extractJson('Here: {"a":1} done')).toEqual({ a: 1 });
  });

  test('throws on unparseable text', () => {
    expect(() => extractJson('definitely not json')).toThrow(/not valid JSON/i);
  });
});

describe('formatParseError', () => {
  test('formats a ZodError into per-issue lines with paths', () => {
    const result = CharacterSchema.safeParse({ meta: {} });
    expect(result.success).toBe(false);
    if (result.success) return;
    const text = formatParseError(result.error);
    // Each issue is its own dash line; nested failures carry a dotted path.
    expect(text).toMatch(/^- /m);
    expect(text).toMatch(/meta\./);
  });

  test('formats a plain reference Error as a single line', () => {
    expect(formatParseError(new Error('unknown state "foo"'))).toBe('- unknown state "foo"');
  });
});
