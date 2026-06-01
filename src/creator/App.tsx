import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { Switch } from '@/components/ui/switch.tsx';
import { Textarea } from '@/components/ui/textarea.tsx';
import { generateCharacter } from '@/ai/llm.ts';
import { createOpenAIProvider } from '@/ai/openai.ts';
import { generateCharacterViaBackend } from '@/ai/backend.ts';
import { generateSpritesViaBackend } from '@/ai/spritesBackend.ts';
import {
  isAuthEnabled,
  handleRedirectCallback,
  getAccessToken,
  login,
  logout,
  userEmail,
} from '@/auth/auth.ts';
import type { User } from 'oidc-client-ts';
import { CHROMA, defaultBackgroundForModel, generateCharacterSprites } from '@/ai/image.ts';
import { clearKey, getEnvKey, getKey, setKey } from '@/ai/keystore.ts';
import { applySpritesToCharacter } from '@/creator/image/pack.ts';
import { packSprites } from '@/creator/image/packAtlas.ts';
import type { Character } from '@/engine/schema.ts';
import { Playtest } from '@/creator/Playtest.tsx';

const EXAMPLE = 'a stone golem brawler with a slow, heavy uppercut and lots of health';

// A key from .env (if any) takes over — the manual key card is then hidden.
const ENV_KEY = getEnvKey();
// When set, character generation goes through the BrawlBox backend (key lives
// server-side) instead of BYOK. Sprite generation is still BYOK for now.
const API_BASE = (import.meta.env?.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '');
const BACKEND_MODE = !!API_BASE;
// When auth is configured, backend generation requires a signed-in user.
const AUTH_ENABLED = isAuthEnabled();
// Image model; the project validated gpt-image-2. Override with VITE_IMAGE_MODEL.
const IMAGE_MODEL = (import.meta.env?.VITE_IMAGE_MODEL as string | undefined) || 'gpt-image-2';

export function App() {
  const [apiKey, setApiKey] = useState('');
  const [remember, setRemember] = useState(false);
  const [prompt, setPrompt] = useState(EXAMPLE);
  const [busy, setBusy] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgProgress, setImgProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [character, setCharacter] = useState<Character | null>(null);
  const [atlasUrl, setAtlasUrl] = useState<string | undefined>(undefined);
  const [json, setJson] = useState('');
  const [model, setModel] = useState(IMAGE_MODEL);
  const [user, setUser] = useState<User | null>(null);

  // Complete any hosted-UI redirect (?code=) and load the current session.
  useEffect(() => {
    if (AUTH_ENABLED) void handleRedirectCallback().then(setUser);
  }, []);

  // Backend generation needs a signed-in user when auth is on. Returns the
  // access token, or triggers login (redirect) and returns undefined to abort.
  const ensureToken = async (): Promise<string | null | undefined> => {
    if (!BACKEND_MODE || !AUTH_ENABLED) return null;
    const token = await getAccessToken();
    if (!token) {
      setError('Please sign in to generate.');
      void login();
      return undefined;
    }
    return token;
  };

  // Hydrate any persisted key on first load (skipped when .env provides one).
  useEffect(() => {
    if (!ENV_KEY) {
      const k = getKey();
      if (k) {
        setApiKey(k);
        setRemember(true);
      }
    }
  }, []);

  const resolveKey = (): string | null => {
    const key = ENV_KEY ?? apiKey.trim();
    if (!key) {
      setError('Enter an OpenAI API key first.');
      return null;
    }
    return key;
  };

  const persistKey = (key: string, persist: boolean): void => {
    setApiKey(key);
    if (key) setKey(key, persist);
    else clearKey();
  };

  // Swap in a new atlas object URL, revoking the previous one.
  const swapAtlasUrl = (next: string | undefined): void => {
    setAtlasUrl((prev) => {
      if (prev && prev !== next) URL.revokeObjectURL(prev);
      return next;
    });
  };

  const generate = async (): Promise<void> => {
    setError(null);
    setStatus(null);
    if (!prompt.trim()) {
      setError('Describe the character you want.');
      return;
    }
    // BYOK path needs a key up front; backend path holds the key server-side.
    let key: string | null = null;
    let token: string | null | undefined = null;
    if (!BACKEND_MODE) {
      key = resolveKey();
      if (!key) return;
    } else {
      token = await ensureToken();
      if (token === undefined) return; // redirecting to sign in
    }
    setBusy(true);
    try {
      const result =
        BACKEND_MODE && API_BASE
          ? await generateCharacterViaBackend(API_BASE, { prompt: prompt.trim() }, token)
          : await generateCharacter({ prompt: prompt.trim() }, createOpenAIProvider(key!));
      swapAtlasUrl(undefined); // new config => drop old sprites
      setCharacter(result.character);
      setJson(JSON.stringify(result.character, null, 2));
      setStatus(
        `Valid character generated in ${result.attempts} attempt(s). Now generate sprites.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const generateSprites = async (): Promise<void> => {
    if (!character) return;
    setError(null);
    setStatus(null);
    // BYOK path needs a key; backend path retextures the template server-side.
    let key: string | null = null;
    let token: string | null | undefined = null;
    if (!BACKEND_MODE) {
      key = resolveKey();
      if (!key) return;
    } else {
      token = await ensureToken();
      if (token === undefined) return; // redirecting to sign in
    }
    setImgBusy(true);
    setImgProgress({ done: 0, total: 0 });
    try {
      let images: Record<string, Blob>;
      let packed;
      if (BACKEND_MODE && API_BASE) {
        // fal-retextured template sheet, sliced to per-key frames on black bg.
        images = await generateSpritesViaBackend(API_BASE, prompt.trim(), character, token);
        packed = await packSprites(images, { chromaKey: { r: 0, g: 0, b: 0 }, chromaTolerance: 90 });
      } else {
        const background = defaultBackgroundForModel(model);
        images = await generateCharacterSprites(character, prompt.trim(), key!, {
          model,
          background,
          onProgress: (done, total) => setImgProgress({ done, total }),
        });
        // gpt-image-2 can't emit transparency — key out the magenta backdrop here.
        packed = await packSprites(images, background === 'chroma' ? { chromaKey: CHROMA } : {});
      }
      const sprited = applySpritesToCharacter(
        character,
        `${character.meta.id}/atlas.png`,
        packed.frames,
        packed.hurtboxes,
      );
      swapAtlasUrl(URL.createObjectURL(packed.atlasBlob));
      setCharacter(sprited);
      setJson(JSON.stringify(sprited, null, 2));
      setStatus('Sprites generated.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImgBusy(false);
      setImgProgress(null);
    }
  };

  const download = (): void => {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${character?.meta.id ?? 'character'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasSprites = Boolean(atlasUrl);

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">
          BrawlBox <span className="text-muted-foreground">character creator</span>
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {ENV_KEY
              ? 'key loaded from .env'
              : BACKEND_MODE
                ? 'generation via BrawlBox API'
                : 'M2.2 — AI sprite generation'}
          </span>
          {AUTH_ENABLED &&
            (user ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{userEmail(user)}</span>
                <Button variant="secondary" size="sm" onClick={() => void logout()}>
                  Sign out
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={() => void login()}>
                Sign in
              </Button>
            ))}
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[420px_1fr]">
        {/* Controls */}
        <div className="flex flex-col gap-4">
          {!ENV_KEY && !BACKEND_MODE && (
            <Card>
              <CardHeader>
                <CardTitle>OpenAI key</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Input
                  type="password"
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => persistKey(e.target.value, remember)}
                  autoComplete="off"
                />
                <div className="flex items-center justify-between">
                  <Label htmlFor="remember" className="text-muted-foreground">
                    Remember on this device
                  </Label>
                  <Switch
                    id="remember"
                    checked={remember}
                    onCheckedChange={(v) => {
                      setRemember(v);
                      persistKey(apiKey, v);
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {BACKEND_MODE
                    ? 'Only needed for sprite generation. Character generation uses the BrawlBox API — no key required.'
                    : 'Sent only to api.openai.com, never to any BrawlBox server.'}
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Describe your fighter</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Textarea
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={EXAMPLE}
              />
              <Button onClick={generate} disabled={busy || imgBusy}>
                {busy ? 'Generating…' : '1 · Generate character'}
              </Button>

              {character && (
                <>
                  {!BACKEND_MODE && (
                    <div className="flex items-center gap-2">
                      <Label htmlFor="model" className="text-muted-foreground whitespace-nowrap">
                        Image model
                      </Label>
                      <Input
                        id="model"
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        className="h-8"
                      />
                    </div>
                  )}
                  <Button variant="secondary" onClick={generateSprites} disabled={busy || imgBusy}>
                    {imgBusy
                      ? hasSprites || BACKEND_MODE
                        ? 'Generating sprites…'
                        : `Generating sprites… ${imgProgress?.done ?? 0}/${imgProgress?.total ?? '?'}`
                      : hasSprites
                        ? '2 · Regenerate sprites'
                        : '2 · Generate sprites'}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {BACKEND_MODE
                      ? 'Sprites are generated on the BrawlBox API (fal retexture). Takes about a minute.'
                      : 'Sprite generation makes one image API call per animation frame (billed to your key). Takes a minute or two.'}
                  </p>
                </>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}
              {status && <p className="text-sm text-primary">{status}</p>}
            </CardContent>
          </Card>

          {json && (
            <Card className="flex-1">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>character.json</CardTitle>
                <Button size="sm" variant="outline" onClick={download}>
                  Download
                </Button>
              </CardHeader>
              <CardContent>
                <pre className="max-h-[340px] overflow-auto rounded-md bg-secondary/40 p-3 text-xs leading-relaxed">
                  {json}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Playtest */}
        <Card className="flex flex-col">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Playtest</CardTitle>
            <span className="text-xs text-muted-foreground">
              P1: WASD + J/K/L · P2: arrows + numpad · R restart · F1 debug
            </span>
          </CardHeader>
          <CardContent>
            <Playtest character={character} atlasUrl={atlasUrl} />
            <p className="mt-2 text-xs text-muted-foreground">
              Pink = base (P1). Blue = {character ? 'your fighter' : 'base'} (P2).
              {character &&
                !hasSprites &&
                ' Renders as a silhouette until you generate sprites (step 2).'}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
