// Client for the vision "describe" endpoint: send the uploaded reference image
// (+ optional notes) and get back an auto-generated character name + appearance
// description. Used to default the name/description for reference-image creation.

export interface CharacterIdea {
  name: string;
  description: string;
}

export async function describeFromImage(
  baseUrl: string,
  image: string,
  prompt: string,
  token?: string | null,
): Promise<CharacterIdea> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}/generate/describe`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ image, prompt }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Describe failed (${res.status})${text ? `: ${text}` : ''}`);
  }
  return (await res.json()) as CharacterIdea;
}

const BYOK_SYSTEM =
  `You are a character designer for a 2D fighting game. Look at the image and design a playable ` +
  `fighter inspired by the subject. Reply with ONLY a JSON object: ` +
  `{"name": "<a short, cool fighter name, 1-3 words>", ` +
  `"description": "<one vivid English sentence describing the character's appearance — hair, ` +
  `outfit, colors, build — for an artist to draw>"}.`;

/**
 * BYOK variant of {@link describeFromImage}: calls the OpenAI vision API directly
 * from the browser with the user's own key (no backend). Returns a {name,
 * description}. Callers treat failure as non-fatal (fall back to defaults).
 */
export async function describeFromImageBYOK(
  openaiKey: string,
  image: string,
  prompt: string,
  model = 'gpt-4o-mini',
): Promise<CharacterIdea> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: BYOK_SYSTEM },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
                ? `Extra direction from the player: ${prompt}`
                : 'Design the fighter from the image alone.',
            },
            { type: 'image_url', image_url: { url: image } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`Describe failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? '';
  let obj: { name?: unknown; description?: unknown } = {};
  try {
    obj = JSON.parse(content) as typeof obj;
  } catch {
    // response_format should guarantee JSON, but tolerate a stray wrapper.
    const m = content.match(/\{[\s\S]*\}/);
    if (m) obj = JSON.parse(m[0]) as typeof obj;
  }
  const name = typeof obj.name === 'string' ? obj.name.trim() : '';
  const description = typeof obj.description === 'string' ? obj.description.trim() : '';
  if (!name && !description) throw new Error('describe returned nothing usable');
  return { name, description };
}
