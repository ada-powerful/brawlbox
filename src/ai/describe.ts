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
