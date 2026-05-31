// Browser-direct OpenAI chat provider (BYOK). The key goes only to OpenAI —
// no proxy (architectural commitment 3b.7).
import type { ChatProvider } from './types.ts';

export interface OpenAIOptions {
  model?: string;
  baseUrl?: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

interface ChatCompletion {
  choices?: { message?: { content?: string } }[];
}

export function createOpenAIProvider(apiKey: string, opts: OpenAIOptions = {}): ChatProvider {
  const model = opts.model ?? 'gpt-4o';
  const baseUrl = opts.baseUrl ?? 'https://api.openai.com/v1';
  const doFetch = opts.fetchImpl ?? fetch;

  return async (messages) => {
    const res = await doFetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        // Force a single JSON object back (the word "JSON" is present in the
        // system prompt, which this mode requires).
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`OpenAI request failed (${res.status}): ${detail}`);
    }

    const data = (await res.json()) as ChatCompletion;
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenAI returned an empty completion');
    return content;
  };
}
