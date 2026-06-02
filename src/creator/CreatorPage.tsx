import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { Switch } from '@/components/ui/switch.tsx';
import { Textarea } from '@/components/ui/textarea.tsx';
import { generateCharacter } from '@/ai/llm.ts';
import { createOpenAIProvider } from '@/ai/openai.ts';
import { generateCharacterViaBackend } from '@/ai/backend.ts';
import {
  fetchSheetAndDetect,
  fetchSheetBitmap,
  cropSelection,
  type DetectedSheet,
} from '@/ai/spritesBackend.ts';
import { getAccessToken, login } from '@/auth/auth.ts';
import { CHROMA, defaultBackgroundForModel, generateCharacterSprites } from '@/ai/image.ts';
import { clearKey, getEnvKey, getKey, setKey } from '@/ai/keystore.ts';
import { applySpritesToCharacter } from '@/creator/image/pack.ts';
import { packSprites } from '@/creator/image/packAtlas.ts';
import { sliceGridSheet } from '@/creator/image/sliceGrid.ts';
import { collectReferencedSprites } from '@/runtime/atlas.ts';
import {
  TEMPLATES,
  FREEFORM_ID,
  DEFAULT_TEMPLATE_ID,
  getTemplate,
  type CharacterTemplate,
} from '@/creator/templates.ts';
import type { Character } from '@/engine/schema.ts';
import { Playtest } from '@/creator/Playtest.tsx';
import { Headshot } from '@/creator/Headshot.tsx';
import { FrameReview } from '@/creator/FrameReview.tsx';
import {
  saveCloudCharacter,
  deleteCloudCharacter,
  renameCloudCharacter,
  archiveCloudCharacter,
  shareCloudCharacter,
  type CloudCharacter,
} from '@/creator/store/cloud.ts';
import { API_BASE, AUTH_ENABLED, BACKEND_MODE, CAN_CLOUD } from '@/app/config.ts';
import { useSession } from '@/app/session.ts';

const EXAMPLE = 'a stone golem brawler with a slow, heavy uppercut and lots of health';

// The LLM picks meta.id (e.g. two "golem" prompts can collide). The cloud record
// is keyed by meta.id, so a short random suffix keeps every generated character a
// distinct record — auto-save then never clobbers a previously saved fighter.
const withUniqueId = (c: Character): Character => ({
  ...c,
  meta: { ...c.meta, id: `${c.meta.id}-${crypto.randomUUID().slice(0, 8)}` },
});

// A key from .env (if any) takes over — the manual key card is then hidden.
const ENV_KEY = getEnvKey();
// Image model; the project validated gpt-image-2. Override with VITE_IMAGE_MODEL.
const IMAGE_MODEL = (import.meta.env?.VITE_IMAGE_MODEL as string | undefined) || 'gpt-image-2';

export function CreatorPage() {
  // Shared session (auth + saved characters + gallery) from the layout.
  const { user, saved, savedError, refreshSaved, gallery, refreshGallery } = useSession();

  const [apiKey, setApiKey] = useState('');
  const [remember, setRemember] = useState(false);
  // Which template the new fighter is built from. A real template reuses its
  // base character's gameplay and only re-skins the art (NB2); FREEFORM_ID keeps
  // the legacy "AI designs a brand-new character" path.
  const [templateId, setTemplateId] = useState<string>(DEFAULT_TEMPLATE_ID);
  const template: CharacterTemplate | undefined = getTemplate(templateId);
  const [prompt, setPrompt] = useState(EXAMPLE);
  const [busy, setBusy] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgProgress, setImgProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [character, setCharacter] = useState<Character | null>(null);
  const [atlasUrl, setAtlasUrl] = useState<string | undefined>(undefined);
  // Which slot the user's fighter occupies in the playtest (default P2).
  const [playerSide, setPlayerSide] = useState<'p1' | 'p2'>('p2');
  const [json, setJson] = useState('');
  const [model, setModel] = useState(IMAGE_MODEL);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  // M2.3 frame-review: the retextured sheet (backend path) + the editable
  // spriteKey→frame mapping. `repacking` guards the console during a re-pack.
  const [sheet, setSheet] = useState<DetectedSheet | null>(null);
  const [selection, setSelection] = useState<Record<string, number>>({});
  const [repacking, setRepacking] = useState(false);
  // Set when Escape cancels a rename, so the unmount-triggered blur doesn't save.
  const cancelRenameRef = useRef(false);

  // Cloud storage is available when signed in to the backend.
  const canCloud = CAN_CLOUD;

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

  // Release the previous sheet's object URL + decoded bitmap when it is replaced
  // (new generation) or on unmount. Editing the selection keeps the same `sheet`
  // identity, so this never fires mid-remap.
  useEffect(() => {
    return () => {
      if (sheet) {
        URL.revokeObjectURL(sheet.sheetUrl);
        sheet.bitmap.close();
      }
    };
  }, [sheet]);

  // Crop the chosen frame per pose, pack the atlas, apply it to `char`, show it
  // in the playtest, and auto-save. Shared by the initial sprite-gen and every
  // frame re-map. We key out the sheet's own (auto-sampled) background color.
  const applyBackendSelection = async (
    s: DetectedSheet,
    sel: Record<string, number>,
    char: Character,
  ): Promise<void> => {
    const images = await cropSelection(s.bitmap, s.frames, sel);
    const packed = await packSprites(images, {
      chromaKey: s.bg,
      chromaTolerance: 110,
    });
    const sprited = applySpritesToCharacter(
      char,
      `${char.meta.id}/atlas.png`,
      packed.frames,
      packed.hurtboxes,
    );
    swapAtlasUrl(URL.createObjectURL(packed.atlasBlob));
    setCharacter(sprited);
    setJson(JSON.stringify(sprited, null, 2));
    void autoSave(sprited, packed.atlasBlob);
  };

  // Re-map a single pose to a different detected frame, then re-pack live.
  const remapFrame = (next: Record<string, number>): void => {
    if (!sheet || !character) return;
    setSelection(next);
    setRepacking(true);
    applyBackendSelection(sheet, next, character)
      .catch((e) => setError((e as Error).message))
      .finally(() => setRepacking(false));
  };

  // Template path: instantiate the chosen template's base character directly —
  // no LLM. The fighter reuses the template's moveset; the prompt only drives
  // the look (used later when NB2 re-skins the sprites). Strips the base atlas so
  // it renders as a silhouette until step 2 bakes the new art in.
  const createFromTemplate = (tpl: CharacterTemplate): void => {
    const name = prompt.trim().slice(0, 48) || tpl.label;
    const newChar = withUniqueId({
      ...tpl.base,
      spriteAtlas: undefined,
      meta: { ...tpl.base.meta, name },
    });
    swapAtlasUrl(undefined); // new config => drop old sprites
    setSheet(null); // and the old review sheet
    setCharacter(newChar);
    setJson(JSON.stringify(newChar, null, 2));
    setStatus('Template ready. Now generate sprites to give it your look.');
    void autoSave(newChar); // persist immediately so it survives sign-out
  };

  const generate = async (): Promise<void> => {
    setError(null);
    setStatus(null);
    if (!prompt.trim()) {
      setError('Describe the character you want.');
      return;
    }
    // Template-based creation needs no AI for this step — just clone the base.
    if (template) {
      setBusy(true);
      try {
        createFromTemplate(template);
      } finally {
        setBusy(false);
      }
      return;
    }
    // Freeform path: BYOK needs a key up front; backend holds the key server-side.
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
      // Give it a unique id so auto-save can't clobber a prior fighter that the
      // LLM happened to give the same meta.id.
      const newChar = withUniqueId(result.character);
      swapAtlasUrl(undefined); // new config => drop old sprites
      setSheet(null); // and the old review sheet
      setCharacter(newChar);
      setJson(JSON.stringify(newChar, null, 2));
      setStatus(
        `Valid character generated in ${result.attempts} attempt(s). Now generate sprites.`,
      );
      void autoSave(newChar); // persist immediately so it survives sign-out
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Template path: NB2 re-skins the template's green-screen layout sheet, then
  // we slice it by the fixed grid (no auto-detect), key out the green, and bake
  // the art onto the current character. Deterministic — no frame-review console.
  const generateTemplateSprites = async (
    tpl: CharacterTemplate,
    char: Character,
    token: string | null | undefined,
    baseUrl: string,
  ): Promise<void> => {
    const fetched = await fetchSheetBitmap(baseUrl, prompt.trim(), token, tpl.backendTemplateKey);
    try {
      const keys = collectReferencedSprites(char);
      const images = await sliceGridSheet(fetched.bitmap, tpl.grid, keys);
      const packed = await packSprites(images, {
        chromaKey: fetched.bg,
        chromaTolerance: 110,
        despill: true,
      });
      const sprited = applySpritesToCharacter(
        char,
        `${char.meta.id}/atlas.png`,
        packed.frames,
        packed.hurtboxes,
      );
      swapAtlasUrl(URL.createObjectURL(packed.atlasBlob));
      setCharacter(sprited);
      setJson(JSON.stringify(sprited, null, 2));
      setStatus('Sprites generated. Your fighter is ready to play below.');
      void autoSave(sprited, packed.atlasBlob);
    } finally {
      fetched.bitmap.close();
      URL.revokeObjectURL(fetched.sheetUrl);
    }
  };

  const generateSprites = async (): Promise<void> => {
    if (!character) return;
    setError(null);
    setStatus(null);
    // Template path always retextures server-side (NB2), so it needs a token.
    if (template) {
      if (!API_BASE) {
        setError('Sprite generation needs the BrawlBox API (set VITE_API_BASE_URL).');
        return;
      }
      const token = await ensureToken();
      if (token === undefined) return; // redirecting to sign in
      setImgBusy(true);
      setImgProgress({ done: 0, total: 0 });
      try {
        await generateTemplateSprites(template, character, token, API_BASE);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setImgBusy(false);
        setImgProgress(null);
      }
      return;
    }
    // Freeform: BYOK needs a key; backend path retextures the legacy template.
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
      if (BACKEND_MODE && API_BASE) {
        // fal-retextured template sheet. Detect frames + apply the default
        // mapping, then keep the sheet so the review console can re-map poses.
        const detected = await fetchSheetAndDetect(API_BASE, prompt.trim(), character, token);
        setSheet(detected); // replaces+disposes any prior sheet (see effect above)
        setSelection(detected.selection);
        await applyBackendSelection(detected, detected.selection, character);
        setStatus('Sprites generated. Review the frame mapping below and fix any mis-mapped pose.');
      } else {
        const background = defaultBackgroundForModel(model);
        const images = await generateCharacterSprites(character, prompt.trim(), key!, {
          model,
          background,
          onProgress: (done, total) => setImgProgress({ done, total }),
        });
        // gpt-image-2 can't emit transparency — key out the magenta backdrop here.
        const packed = await packSprites(
          images,
          background === 'chroma' ? { chromaKey: CHROMA } : {},
        );
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
        void autoSave(sprited, packed.atlasBlob); // update the same record with the atlas
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImgBusy(false);
      setImgProgress(null);
    }
  };

  // Persist the current character to the cloud automatically. Keyed by meta.id
  // (unique per generation, see withUniqueId), so the post-generation save and
  // the post-sprite save update the SAME record instead of creating duplicates.
  // Non-fatal: a failure shows an indicator but never blocks generation.
  const autoSave = async (char: Character, atlas?: Blob | null): Promise<void> => {
    if (!canCloud || !API_BASE) return;
    setSaveState('saving');
    try {
      const token = await getAccessToken();
      if (!token) {
        setSaveState('error');
        return;
      }
      await saveCloudCharacter(API_BASE, token, {
        character: char,
        name: char.meta.name,
        atlas: atlas ?? undefined,
      });
      setSaveState('saved');
      await refreshSaved();
    } catch {
      setSaveState('error');
    }
  };

  const loadSaved = (c: CloudCharacter): void => {
    setCharacter(c.character);
    setJson(JSON.stringify(c.character, null, 2));
    setSaveState('idle'); // a loaded character is already persisted
    setSheet(null); // a saved character has no source sheet to review
    swapAtlasUrl(c.atlasUrl); // presigned URL; loadAtlasTextures fetches it
    setStatus(`Loaded "${c.name}".`);
  };

  const removeSaved = async (c: CloudCharacter): Promise<void> => {
    if (!canCloud || !API_BASE) return;
    if (!window.confirm(`Permanently delete "${c.name}"? This can't be undone.`)) return;
    const token = await getAccessToken();
    if (!token) return;
    try {
      await deleteCloudCharacter(API_BASE, token, c.characterId);
      await refreshSaved();
      await refreshGallery();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const renameSaved = async (id: string, name: string): Promise<void> => {
    if (cancelRenameRef.current) {
      cancelRenameRef.current = false;
      return;
    }
    setRenaming(null);
    const trimmed = name.trim();
    if (!canCloud || !API_BASE || !trimmed) return;
    const token = await getAccessToken();
    if (!token) return;
    try {
      await renameCloudCharacter(API_BASE, token, id, trimmed);
      // Keep the loaded character's name in sync if it's the one being renamed.
      if (character?.meta.id === id) {
        const next = { ...character, meta: { ...character.meta, name: trimmed } };
        setCharacter(next);
        setJson(JSON.stringify(next, null, 2));
      }
      await refreshSaved();
      await refreshGallery();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const setArchived = async (id: string, archived: boolean): Promise<void> => {
    if (!canCloud || !API_BASE) return;
    const token = await getAccessToken();
    if (!token) return;
    try {
      await archiveCloudCharacter(API_BASE, token, id, archived);
      await refreshSaved();
      await refreshGallery();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggleShare = async (c: CloudCharacter): Promise<void> => {
    if (!canCloud || !API_BASE) return;
    const token = await getAccessToken();
    if (!token) return;
    try {
      await shareCloudCharacter(API_BASE, token, c.characterId, !c.shared);
      await refreshSaved();
      await refreshGallery();
    } catch (e) {
      setError((e as Error).message);
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
  const activeSaved = saved.filter((c) => !c.archived);
  const archivedSaved = saved.filter((c) => c.archived);

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Describe a fighter and generate it, or{' '}
        <Link to="/play" className="text-primary hover:underline">
          skip and play with the built-in characters
        </Link>
        .
      </p>

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
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="template" className="text-muted-foreground">
                  Template
                </Label>
                <select
                  id="template"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  disabled={busy || imgBusy}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                >
                  {TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                  <option value={FREEFORM_ID}>Freeform (AI-designed)</option>
                </select>
                {template && <p className="text-xs text-muted-foreground">{template.hint}</p>}
              </div>
              <Textarea
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  template
                    ? 'Describe how your fighter LOOKS — e.g. a grizzled ronin in red lacquered armor'
                    : EXAMPLE
                }
              />
              <Button onClick={generate} disabled={busy || imgBusy}>
                {busy
                  ? template
                    ? 'Preparing…'
                    : 'Generating…'
                  : template
                    ? '1 · Use this template'
                    : '1 · Generate character'}
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
                  {canCloud && saveState !== 'idle' && (
                    <p
                      className={
                        saveState === 'error'
                          ? 'text-xs text-destructive'
                          : 'text-xs text-muted-foreground'
                      }
                    >
                      {saveState === 'saving'
                        ? 'Saving to your collection…'
                        : saveState === 'saved'
                          ? 'Saved to your collection — it will be here when you sign back in.'
                          : "Couldn't save to your collection (it's still here for now — try regenerating)."}
                    </p>
                  )}
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

          {canCloud && user && (
            <Card>
              <CardHeader>
                <CardTitle>My characters</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {savedError && <p className="text-sm text-destructive">{savedError}</p>}
                {!savedError && saved.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Characters you generate are saved here automatically and stay across sign-ins.
                  </p>
                )}
                {activeSaved.map((c) => (
                  <div key={c.characterId} className="flex items-center gap-2">
                    <Headshot character={c.character} atlasUrl={c.atlasUrl} name={c.name} />
                    {renaming?.id === c.characterId ? (
                      <Input
                        className="h-8 flex-1"
                        autoFocus
                        value={renaming.name}
                        onChange={(e) => setRenaming({ id: c.characterId, name: e.target.value })}
                        onBlur={() => void renameSaved(c.characterId, renaming.name)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void renameSaved(c.characterId, renaming.name);
                          if (e.key === 'Escape') {
                            cancelRenameRef.current = true;
                            setRenaming(null);
                          }
                        }}
                      />
                    ) : (
                      <button
                        className={`flex-1 truncate text-left text-sm hover:underline ${
                          character?.meta.id === c.characterId ? 'font-semibold text-primary' : ''
                        }`}
                        onClick={() => loadSaved(c)}
                      >
                        {c.name}
                        {c.shared && <span className="ml-1 text-xs text-primary">· shared</span>}
                      </button>
                    )}
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRenaming({ id: c.characterId, name: c.name })}
                      >
                        Rename
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void toggleShare(c)}>
                        {c.shared ? 'Unshare' : 'Share'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void setArchived(c.characterId, true)}
                      >
                        Archive
                      </Button>
                    </div>
                  </div>
                ))}

                {archivedSaved.length > 0 && (
                  <>
                    <button
                      className="mt-1 text-left text-xs text-muted-foreground hover:underline"
                      onClick={() => setShowArchived((v) => !v)}
                    >
                      {showArchived ? '▾' : '▸'} Archived ({archivedSaved.length})
                    </button>
                    {showArchived &&
                      archivedSaved.map((c) => (
                        <div key={c.characterId} className="flex items-center gap-2 opacity-70">
                          <Headshot character={c.character} atlasUrl={c.atlasUrl} name={c.name} />
                          <span className="flex-1 truncate text-sm">{c.name}</span>
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void setArchived(c.characterId, false)}
                            >
                              Restore
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => void removeSaved(c)}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      ))}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {gallery.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Gallery</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                {gallery.map((c) => (
                  <button
                    key={c.characterId}
                    className="truncate text-left text-sm hover:underline"
                    onClick={() => loadSaved(c)}
                  >
                    {c.name}
                  </button>
                ))}
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
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Play your fighter as</span>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant={playerSide === 'p1' ? 'default' : 'outline'}
                  onClick={() => setPlayerSide('p1')}
                >
                  P1
                </Button>
                <Button
                  size="sm"
                  variant={playerSide === 'p2' ? 'default' : 'outline'}
                  onClick={() => setPlayerSide('p2')}
                >
                  P2
                </Button>
              </div>
            </div>
            <Playtest character={character} atlasUrl={atlasUrl} side={playerSide} />
            <p className="mt-2 text-xs text-muted-foreground">
              Pink = {playerSide === 'p1' && character ? 'your fighter' : 'base'} (P1). Blue ={' '}
              {playerSide === 'p2' && character ? 'your fighter' : 'base'} (P2).
              {character &&
                !hasSprites &&
                ' Renders as a silhouette until you generate sprites (step 2).'}
            </p>
          </CardContent>
        </Card>
      </div>

      {sheet && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Review frames</CardTitle>
            <span className="text-xs text-muted-foreground">
              {repacking ? 'Re-packing…' : 'Click a pose, then a frame to fix a mis-mapped sprite'}
            </span>
          </CardHeader>
          <CardContent>
            <FrameReview
              sheetUrl={sheet.sheetUrl}
              width={sheet.width}
              height={sheet.height}
              frames={sheet.frames}
              selection={selection}
              onChange={remapFrame}
              busy={repacking}
            />
          </CardContent>
        </Card>
      )}
    </>
  );
}
