import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { Switch } from '@/components/ui/switch.tsx';
import { Textarea } from '@/components/ui/textarea.tsx';
import { generateCharacter } from '@/ai/llm.ts';
import { createOpenAIProvider } from '@/ai/openai.ts';
import { clearKey, getKey, setKey } from '@/ai/keystore.ts';
import type { Character } from '@/engine/schema.ts';
import { Playtest } from '@/creator/Playtest.tsx';

const EXAMPLE = 'a stone golem brawler with a slow, heavy uppercut and lots of health';

export function App() {
  const [apiKey, setApiKey] = useState('');
  const [remember, setRemember] = useState(false);
  const [prompt, setPrompt] = useState(EXAMPLE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [character, setCharacter] = useState<Character | null>(null);
  const [json, setJson] = useState('');

  // Hydrate any persisted key on first load.
  useEffect(() => {
    const k = getKey();
    if (k) {
      setApiKey(k);
      setRemember(true);
    }
  }, []);

  const persistKey = (key: string, persist: boolean): void => {
    setApiKey(key);
    if (key) setKey(key, persist);
    else clearKey();
  };

  const generate = async (): Promise<void> => {
    setError(null);
    setStatus(null);
    if (!apiKey.trim()) {
      setError('Enter an OpenAI API key first.');
      return;
    }
    if (!prompt.trim()) {
      setError('Describe the character you want.');
      return;
    }
    setBusy(true);
    try {
      const provider = createOpenAIProvider(apiKey.trim());
      const result = await generateCharacter({ prompt: prompt.trim() }, provider);
      setCharacter(result.character);
      setJson(JSON.stringify(result.character, null, 2));
      setStatus(`Valid character generated in ${result.attempts} attempt(s).`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
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

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">
          ftg <span className="text-muted-foreground">character creator</span>
        </h1>
        <span className="text-xs text-muted-foreground">M2.1 — BYOK config generation</span>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[420px_1fr]">
        {/* Controls */}
        <div className="flex flex-col gap-4">
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
                Sent only to api.openai.com, never to any ftg server.
              </p>
            </CardContent>
          </Card>

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
              <Button onClick={generate} disabled={busy}>
                {busy ? 'Generating…' : 'Generate character'}
              </Button>
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
            <Playtest character={character} />
            <p className="mt-2 text-xs text-muted-foreground">
              Pink = base (P1). Blue = {character ? 'your generated fighter' : 'base'} (P2).
              {character &&
                ' Generated fighters render as silhouettes until sprites are added (M2.2).'}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
