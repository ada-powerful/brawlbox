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
  reskinTemplateBYOK,
  cropSelection,
  type DetectedSheet,
  type FetchedSheet,
} from '@/ai/spritesBackend.ts';
import { getAccessToken, login } from '@/auth/auth.ts';
import {
  CHROMA,
  defaultBackgroundForModel,
  generateCharacterSprites,
  generateGreenReference,
} from '@/ai/image.ts';
import {
  clearKey,
  getEnvKey,
  getKey,
  setKey,
  clearFalKey,
  getEnvFalKey,
  getFalKey,
  setFalKey,
} from '@/ai/keystore.ts';
import { applySpritesToCharacter } from '@/creator/image/pack.ts';
import { packSprites } from '@/creator/image/packAtlas.ts';
import { sliceSheetByDetection } from '@/creator/image/detectSlice.ts';
import {
  generatePortraits,
  generatePortraitsBYOK,
  fileToDataUri,
  type PortraitSet,
} from '@/ai/portraits.ts';
import { describeFromImage, describeFromImageBYOK } from '@/ai/describe.ts';
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
import { ControlsMap } from '@/creator/ControlsMap.tsx';
import { Headshot } from '@/creator/Headshot.tsx';
import { FrameReview } from '@/creator/FrameReview.tsx';
import { AttributesForm } from '@/creator/AttributesForm.tsx';
import { AttributePicker } from '@/creator/AttributePicker.tsx';
import {
  applyAttributes as applyAttributeStats,
  attributesToDescription,
  attributesToName,
  DEFAULT_ATTRIBUTES,
  type Attributes,
} from '@/creator/attributes.ts';
import { IdlePreview } from '@/creator/IdlePreview.tsx';
import { P1_COLOR } from '@/creator/defaults.ts';
import {
  saveCloudCharacter,
  deleteCloudCharacter,
  renameCloudCharacter,
  archiveCloudCharacter,
  shareCloudCharacter,
  type CloudCharacter,
  type PortraitKeys,
} from '@/creator/store/cloud.ts';
import {
  saveLocalCharacter,
  deleteLocalCharacter,
  renameLocalCharacter,
  archiveLocalCharacter,
} from '@/creator/store/local.ts';
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
// fal.ai key from .env, for the local BYOK photo→fighter path (portraits +
// sprite re-skin). Hides the fal key card when present.
const ENV_FAL_KEY = getEnvFalKey();
// Image model; the project validated gpt-image-2. Override with VITE_IMAGE_MODEL.
const IMAGE_MODEL = (import.meta.env?.VITE_IMAGE_MODEL as string | undefined) || 'gpt-image-2';

// The two generation flows are genuinely different processes, so the UI splits
// them up front rather than inferring from "did you upload a photo?".
type Mode = 'attributes' | 'photo';
type RightTab = 'playtest' | 'controls' | 'attributes' | 'portraits';

// Assemble a portrait set from a loaded character's presigned URLs, or null when
// the record has no saved portraits.
function portraitsFromCloud(c: CloudCharacter): PortraitSet | null {
  if (c.portraitFrontUrl && c.portraitBackUrl && c.portraitHeadshotUrl) {
    return { front: c.portraitFrontUrl, back: c.portraitBackUrl, headshot: c.portraitHeadshotUrl };
  }
  return null;
}

export function CreatorPage() {
  // Shared session (auth + saved characters + gallery) from the layout.
  const { user, saved, savedLoaded, savedError, refreshSaved, gallery, refreshGallery } =
    useSession();

  const [apiKey, setApiKey] = useState('');
  const [remember, setRemember] = useState(false);
  // fal.ai key for the local BYOK photo→fighter path (portraits + sprite re-skin).
  const [falKeyInput, setFalKeyInput] = useState('');
  const [rememberFal, setRememberFal] = useState(false);
  // How the next fighter is created: from a text prompt, or from a reference
  // photo (separate flows with different steps — see the controls below).
  const [mode, setMode] = useState<Mode>('photo');
  // Structured builder inputs (sex / body / physique / style) for "From attributes".
  const [attrs, setAttrs] = useState<Attributes>(DEFAULT_ATTRIBUTES);
  // Free-text look details the attributes don't cover (e.g. clothing, scars,
  // hair). Appended to the attribute-derived description fed to image gen.
  const [lookNotes, setLookNotes] = useState('');
  // Which template the new fighter is built from. A real template reuses its
  // base character's gameplay and only re-skins the art (NB2); FREEFORM_ID keeps
  // the legacy "AI designs a brand-new character" path.
  const [templateId, setTemplateId] = useState<string>(DEFAULT_TEMPLATE_ID);
  const template: CharacterTemplate | undefined = getTemplate(templateId);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  // characterId whose sprites are currently generating. While set, that fighter
  // shows a "Generating…" badge and is not selectable (it has no usable atlas
  // until done); other fighters are locked from loading too, to avoid swapping
  // the working character mid-bake.
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  // Optional uploaded reference photo (data URI) + the NB2 portrait set generated
  // from it. front+back feed the action sheet so every pose stays on-model; the
  // headshot is shown for later in-game use. All three render in the Portraits tab.
  const [refImage, setRefImage] = useState<string | null>(null);
  const [portraits, setPortraits] = useState<PortraitSet | null>(null);
  // S3 keys of the current portrait set, persisted with the character so the
  // headshot/full-body views survive a reload. Mirrored into a ref so auto-save
  // (called from several closures) always sees the latest set.
  const [portraitKeys, setPortraitKeys] = useState<PortraitKeys | null>(null);
  const portraitKeysRef = useRef<PortraitKeys | null>(null);
  useEffect(() => {
    portraitKeysRef.current = portraitKeys;
  }, [portraitKeys]);
  // Latest portrait set in a ref so local auto-save (called from several closures)
  // can persist the portrait blobs alongside the character.
  const portraitsRef = useRef<PortraitSet | null>(null);
  useEffect(() => {
    portraitsRef.current = portraits;
  }, [portraits]);
  const [portraitBusy, setPortraitBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // gpt-5.5-generated appearance description (from the uploaded image + notes).
  // When set, it drives the portrait/sprite prompts instead of the (optional,
  // now-cleared) prompt box.
  const [imageDescription, setImageDescription] = useState<string | null>(null);
  const [imgProgress, setImgProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [character, setCharacter] = useState<Character | null>(null);
  const [atlasUrl, setAtlasUrl] = useState<string | undefined>(undefined);
  const [model, setModel] = useState(IMAGE_MODEL);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  // Which view fills the right-hand panel.
  const [rightTab, setRightTab] = useState<RightTab>('playtest');
  // Draft-applied character for the live idle preview in the Attributes tab.
  // Not persisted — only "Save changes" commits (via applyAttributes).
  const [previewCharacter, setPreviewCharacter] = useState<Character | null>(null);
  // M2.3 frame-review: the retextured sheet (backend path) + the editable
  // spriteKey→frame mapping. `repacking` guards the console during a re-pack.
  const [sheet, setSheet] = useState<DetectedSheet | null>(null);
  const [selection, setSelection] = useState<Record<string, number>>({});
  const [repacking, setRepacking] = useState(false);
  // Set when Escape cancels a rename, so the unmount-triggered blur doesn't save.
  const cancelRenameRef = useRef(false);

  // Cloud storage is available when signed in to the backend.
  const canCloud = CAN_CLOUD;
  // Characters persist either to the cloud (backend) or to IndexedDB (local
  // BYOK). Either way "My characters", auto-save, rename/archive/delete work;
  // only sharing to the public gallery is cloud-only.
  const canPersist = !BACKEND_MODE || canCloud;

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
    if (!ENV_FAL_KEY) {
      const f = getFalKey();
      if (f) {
        setFalKeyInput(f);
        setRememberFal(true);
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

  // An OpenAI key if one is available (env or entered), else null. Used by the
  // local photo path for the optional vision "describe" — never errors, since
  // naming/description is a best-effort nicety on top of the fal-driven art.
  const optionalOpenAIKey = (): string | null => ENV_KEY ?? (apiKey.trim() || null);

  // fal.ai key for the local BYOK path. Errors (and returns null) when missing —
  // portraits + sprite re-skin can't run without it.
  const resolveFalKey = (): string | null => {
    const key = ENV_FAL_KEY ?? falKeyInput.trim();
    if (!key) {
      setError('Enter a fal.ai API key first (needed for local photo→fighter generation).');
      return null;
    }
    return key;
  };

  const persistFalKey = (key: string, persist: boolean): void => {
    setFalKeyInput(key);
    if (key) setFalKey(key, persist);
    else clearFalKey();
  };

  // Switching the creation mode resets the inputs that don't belong to the new
  // flow, so the two processes never bleed into each other.
  const switchMode = (next: Mode): void => {
    if (next === mode) return;
    setMode(next);
    setError(null);
    if (next === 'attributes') {
      // Attributes define the fighter — drop the photo + anything derived from it.
      setRefImage(null);
      setPortraits(null);
      setPortraitKeys(null);
      setImageDescription(null);
    } else {
      // Photo drives the look; clear the example prompt so the notes box is empty.
      if (prompt === EXAMPLE) setPrompt('');
    }
  };

  // Object URLs we created from freshly-baked atlas blobs this session — the only
  // ones safe to revoke on swap. Atlas URLs that come from the saved list (local
  // mode) are shared with the "My characters" thumbnails, so revoking them would
  // break those; cloud atlas URLs are https (revoke is a harmless no-op anyway).
  const ownedAtlasUrls = useRef(new Set<string>());

  // Swap in a new atlas URL, revoking the previous one only if WE baked it.
  const swapAtlasUrl = (next: string | undefined): void => {
    setAtlasUrl((prev) => {
      if (prev && prev !== next && ownedAtlasUrls.current.has(prev)) {
        URL.revokeObjectURL(prev);
        ownedAtlasUrls.current.delete(prev);
      }
      return next;
    });
  };

  // Bake a packed atlas blob into an owned object URL and show it.
  const swapToBakedAtlas = (blob: Blob): void => {
    const url = URL.createObjectURL(blob);
    ownedAtlasUrls.current.add(url);
    swapAtlasUrl(url);
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
    swapToBakedAtlas(packed.atlasBlob);
    setCharacter(sprited);
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
  // no LLM for gameplay (the fighter reuses the template's moveset). When a
  // reference photo is uploaded, gpt-5.5 names + describes the character from the
  // image (+ optional notes); that description drives the look. Strips the base
  // atlas so it renders as a silhouette until sprites are baked in.
  const createFromTemplate = async (tpl: CharacterTemplate): Promise<void> => {
    let name = prompt.trim().slice(0, 48) || tpl.label;
    let described: string | null = null;
    // Attributes mode: stats + size + art all come from the chosen attributes.
    let base: Character = tpl.base;
    if (mode === 'attributes') {
      base = applyAttributeStats(tpl.base, attrs);
      name = attributesToName(attrs);
      described = attributesToDescription(attrs, lookNotes);
    } else if (refImage && BACKEND_MODE && API_BASE) {
      // Photo mode: the backend vision model names + describes from the image.
      const token = await ensureToken();
      if (token === undefined) return; // redirecting to sign in
      setStatus('Reading your photo…');
      try {
        const idea = await describeFromImage(API_BASE, refImage, prompt.trim(), token);
        if (idea.name) name = idea.name;
        described = idea.description || null;
      } catch (e) {
        // Non-fatal: fall back to the template label / prompt for naming.
        setError(`Couldn't read the photo (using defaults): ${(e as Error).message}`);
      }
    } else if (refImage && !BACKEND_MODE) {
      // Local BYOK photo mode: describe via OpenAI vision directly IF a key is
      // present — purely a naming nicety, so skip silently when there's no key
      // (the photo itself still drives the portrait + sprite art via fal).
      const key = optionalOpenAIKey();
      if (key) {
        setStatus('Reading your photo…');
        try {
          const idea = await describeFromImageBYOK(key, refImage, prompt.trim());
          if (idea.name) name = idea.name;
          described = idea.description || null;
        } catch (e) {
          setError(`Couldn't read the photo (using defaults): ${(e as Error).message}`);
        }
      }
    }
    setImageDescription(described);
    const newChar = withUniqueId({
      ...base,
      spriteAtlas: undefined,
      meta: { ...base.meta, name },
    });
    swapAtlasUrl(undefined); // new config => drop old sprites
    setSheet(null); // and the old review sheet
    setCharacter(newChar);
    setStatus(
      described
        ? `Designed “${name}” — ${described}. Now generate portraits, then sprites.`
        : 'Template ready. Now generate sprites to give it your look.',
    );
    void autoSave(newChar); // persist immediately so it survives sign-out
  };

  const generate = async (): Promise<void> => {
    setError(null);
    setStatus(null);
    // Validate per the active flow: a prompt is required in prompt mode, a photo
    // in photo mode.
    if (mode === 'photo' && !refImage) {
      setError('Upload a reference photo, or switch to “From attributes”.');
      return;
    }
    // A brand-new fighter; clear any previous portrait set so it can't carry over.
    setPortraits(null);
    setPortraitKeys(null);
    // Template-based creation: clone the base (+ name/describe from the photo).
    if (template) {
      setBusy(true);
      try {
        await createFromTemplate(template);
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
      // A reference photo can drive a freeform design too: describe it first so
      // the LLM gets an appearance prompt even when the notes box is left empty.
      // In attributes mode the structured choices become the design prompt.
      let designPrompt =
        mode === 'attributes' ? attributesToDescription(attrs, lookNotes) : prompt.trim();
      if (mode === 'photo' && refImage && BACKEND_MODE && API_BASE) {
        setStatus('Reading your photo…');
        try {
          const idea = await describeFromImage(API_BASE, refImage, prompt.trim(), token);
          designPrompt =
            [idea.description, prompt.trim()].filter(Boolean).join(' — ') || designPrompt;
        } catch (e) {
          // Non-fatal: fall back to whatever notes were typed.
          setError(`Couldn't read the photo (using your notes): ${(e as Error).message}`);
        }
      }
      const result =
        BACKEND_MODE && API_BASE
          ? await generateCharacterViaBackend(API_BASE, { prompt: designPrompt }, token)
          : await generateCharacter({ prompt: designPrompt }, createOpenAIProvider(key!));
      // Give it a unique id so auto-save can't clobber a prior fighter that the
      // LLM happened to give the same meta.id.
      const newChar = withUniqueId(result.character);
      swapAtlasUrl(undefined); // new config => drop old sprites
      setSheet(null); // and the old review sheet
      setCharacter(newChar);
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
  // Shared tail for both template paths (backend + local BYOK): slice the
  // retextured sheet by the template grid, key out the green, bake the atlas,
  // apply it, and show the fighter. Owns + disposes `fetched`.
  const bakeReskinnedSheet = async (
    tpl: CharacterTemplate,
    char: Character,
    fetched: FetchedSheet,
  ): Promise<void> => {
    try {
      const keys = collectReferencedSprites(char);
      // Detect poses by their green gaps (robust to NB2's variable output size/
      // aspect) and map them to keys by the template's known grid structure.
      const images = await sliceSheetByDetection(fetched.bitmap, tpl.grid, keys, tpl.bg);
      const packed = await packSprites(images, {
        // Pack poses near 1:1 with the 4K re-skin source (the 12-col sheet is
        // ≈341px per source cell) so the fighter keeps its full generated detail
        // instead of throwing ~40% of it away at 240px. The canonical-action
        // atlas is ~10×9 cells → 10×340=3400 / 9×340=3060, both under the 4096
        // GPU texture limit. cellH only affects spriteScale, not on-screen size
        // (= content/cellH × size.height), so the fighter is unchanged in size —
        // just sharper.
        cellW: 340,
        cellH: 340,
        chromaKey: tpl.bg,
        chromaTolerance: 110,
        despill: true,
        robustScale: true,
      });
      const sprited = applySpritesToCharacter(
        char,
        `${char.meta.id}/atlas.png`,
        packed.frames,
        packed.hurtboxes,
      );
      swapToBakedAtlas(packed.atlasBlob);
      setCharacter(sprited);
      setStatus('Sprites generated. Your fighter is ready to play.');
      setRightTab('playtest'); // ready → bring the finished fighter into view
      void autoSave(sprited, packed.atlasBlob); // no-ops without a backend
    } finally {
      fetched.bitmap.close();
      URL.revokeObjectURL(fetched.sheetUrl);
    }
  };

  // Backend template path: API re-skins the green-screen sheet, then bake.
  const generateTemplateSprites = async (
    tpl: CharacterTemplate,
    char: Character,
    token: string | null | undefined,
    baseUrl: string,
    // The portraits to steer the re-skin. Passed in by the merged flow (fresh,
    // not yet in state); falls back to whatever's in state otherwise.
    portraitSet?: PortraitSet | null,
  ): Promise<void> => {
    const refs = portraitSet ?? portraits;
    const fetched = await fetchSheetBitmap(
      baseUrl,
      imageDescription ?? prompt.trim(),
      token,
      tpl.backendTemplateKey,
      refs ? { frontUrl: refs.front, backUrl: refs.back } : undefined,
    );
    await bakeReskinnedSheet(tpl, char, fetched);
  };

  // Local BYOK template path: nano-banana-2 re-skins the bundled green-screen
  // sheet in the browser (user's fal key + front/back portrait blobs), then bake.
  const generateTemplateSpritesBYOK = async (
    tpl: CharacterTemplate,
    char: Character,
    falKey: string,
    portraitSet?: PortraitSet | null,
  ): Promise<void> => {
    const description = imageDescription ?? prompt.trim();
    const portraitRefs = portraitSet ?? portraits;
    let refs: { front: Blob; back: Blob } | { reference: Blob };
    if (portraitRefs?.blobs) {
      // Photo flow: front + back portraits keep poses on-model from both sides.
      refs = { front: portraitRefs.blobs.front, back: portraitRefs.blobs.back };
    } else {
      // Attributes flow (no photo): make one OpenAI reference from the description.
      const key = optionalOpenAIKey();
      if (!key) {
        throw new Error(
          'Add a reference photo, or enter an OpenAI key, to generate this fighter’s look locally.',
        );
      }
      setStatus('Designing a reference look…');
      refs = { reference: await generateGreenReference(key, description || char.meta.name) };
    }
    const fetched = await reskinTemplateBYOK(falKey, tpl.templateSheetUrl, description, refs, (s) =>
      setStatus(`Skinning your fighter… (${s.toLowerCase()})`),
    );
    await bakeReskinnedSheet(tpl, char, fetched);
  };

  // Pick + downscale a reference photo. Clears any stale portraits so the next
  // "Generate portraits" works from the new image.
  const onPickImage = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setError(null);
    try {
      const dataUri = await fileToDataUri(file);
      setRefImage(dataUri);
      setPortraits(null);
      setPortraitKeys(null);
      setImageDescription(null);
      // The photo defines the look now — clear the (optional) text prompt; the
      // name + description are auto-generated from the image on "Use template".
      setPrompt('');
    } catch (e) {
      setError(`Could not read that image: ${(e as Error).message}`);
    }
  };

  // Photo flow as ONE step: generate the portraits (progress shown on the
  // Portraits tab — they appear there the moment they're ready), then chain
  // straight into the sprite re-skin using them. When sprites finish, the sprite
  // step flips the view to Playtest with the finished fighter loaded.
  const generateFromPhoto = async (): Promise<void> => {
    if (!character || !refImage) return;
    setError(null);
    setStatus(null);
    const description = imageDescription ?? prompt.trim();
    // Resolve credentials per mode up front: backend needs a (maybe) token;
    // the local BYOK path needs the user's fal key.
    let token: string | null | undefined = null;
    let falKey: string | null = null;
    if (BACKEND_MODE) {
      if (!API_BASE) {
        setError('Generation needs the BrawlBox API (set VITE_API_BASE_URL).');
        return;
      }
      token = await ensureToken();
      if (token === undefined) return; // redirecting to sign in
    } else {
      falKey = resolveFalKey();
      if (!falKey) return;
    }
    setRightTab('portraits'); // watch portraits land, then "generating sprites…"
    setGeneratingId(character.meta.id); // keep the "My characters" badge up for both phases
    setPortraitBusy(true);
    let set: PortraitSet;
    try {
      set =
        BACKEND_MODE && API_BASE
          ? await generatePortraits(API_BASE, refImage, description, token)
          : await generatePortraitsBYOK(falKey!, refImage, description, (s) =>
              setStatus(`Generating portraits… (${s.toLowerCase()})`),
            );
      setPortraits(set);
      setPortraitKeys(set.keys ?? null);
      // Backend persists the portrait keys onto the record immediately. Awaited
      // (not fire-and-forget) so this pre-sprite save can't land *after* the
      // post-sprite save below and overwrite the stored character JSON with a
      // spriteAtlas-less copy — a full-record PutItem, so last write wins. The
      // local BYOK path has no keys (no S3) and autoSave no-ops without a backend.
      if (set.keys) await autoSave(character, undefined, set.keys);
      setStatus('Portraits ready — now skinning your fighter…');
    } catch (e) {
      setError((e as Error).message);
      setGeneratingId(null);
      return;
    } finally {
      setPortraitBusy(false);
    }
    // Reuse the fresh portraits as the look reference (state isn't updated yet).
    await generateSprites(set);
  };

  const generateSprites = async (portraitSet?: PortraitSet | null): Promise<void> => {
    if (!character) return;
    setError(null);
    setStatus(null);
    // Template path: NB2 re-skins the green-screen sheet — server-side with the
    // backend, or locally in the browser with the user's fal key (BYOK).
    if (template) {
      let token: string | null | undefined = null;
      let falKey: string | null = null;
      if (BACKEND_MODE) {
        if (!API_BASE) {
          setError('Sprite generation needs the BrawlBox API (set VITE_API_BASE_URL).');
          return;
        }
        token = await ensureToken();
        if (token === undefined) return; // redirecting to sign in
      } else {
        falKey = resolveFalKey();
        if (!falKey) return;
      }
      setImgBusy(true);
      setGeneratingId(character.meta.id);
      setImgProgress({ done: 0, total: 0 });
      try {
        if (BACKEND_MODE && API_BASE) {
          await generateTemplateSprites(template, character, token, API_BASE, portraitSet);
        } else {
          await generateTemplateSpritesBYOK(template, character, falKey!, portraitSet);
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setImgBusy(false);
        setGeneratingId(null);
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
    setGeneratingId(character.meta.id);
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
        swapToBakedAtlas(packed.atlasBlob);
        setCharacter(sprited);
        setStatus('Sprites generated.');
        setRightTab('playtest'); // ready → show the finished fighter
        void autoSave(sprited, packed.atlasBlob); // update the same record with the atlas
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImgBusy(false);
      setGeneratingId(null);
      setImgProgress(null);
    }
  };

  // Persist the current character to the cloud automatically. Keyed by meta.id
  // (unique per generation, see withUniqueId), so the post-generation save and
  // the post-sprite save update the SAME record instead of creating duplicates.
  // Portrait keys ride along (latest known set) so the saved record keeps its
  // headshot/full-body art; the backend preserves stored keys when none is sent.
  // Non-fatal: a failure shows an indicator but never blocks generation.
  const autoSave = async (
    char: Character,
    atlas?: Blob | null,
    portraitKeysOverride?: PortraitKeys | null,
  ): Promise<void> => {
    if (!BACKEND_MODE) {
      // Local BYOK persistence (IndexedDB): store the character + atlas blob +
      // portrait blobs. saveLocalCharacter merges, so a partial save (no atlas)
      // never wipes previously baked sprites.
      setSaveState('saving');
      try {
        await saveLocalCharacter({
          character: char,
          name: char.meta.name,
          atlas: atlas ?? undefined,
          portraits: portraitsRef.current?.blobs ?? null,
        });
        setSaveState('saved');
        await refreshSaved();
      } catch {
        setSaveState('error');
      }
      return;
    }
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
        portraitKeys: portraitKeysOverride ?? portraitKeysRef.current ?? undefined,
      });
      setSaveState('saved');
      await refreshSaved();
    } catch {
      setSaveState('error');
    }
  };

  // Commit edited attributes: update the live character (the playtest canvas
  // re-renders with the new stats) and persist. We don't have the atlas blob in
  // hand for a loaded fighter, but the atlas key is deterministic so it's kept.
  const applyAttributes = (next: Character): void => {
    setCharacter(next);
    setStatus('Attributes updated.');
    void autoSave(next);
  };

  const loadSaved = (c: CloudCharacter): void => {
    // Locked while a fighter is mid-generation: switching would swap the working
    // character out from under the running bake, and the in-progress fighter has
    // no usable atlas yet anyway.
    if (imgBusy || portraitBusy) return;
    setCharacter(c.character);
    setPortraits(portraitsFromCloud(c)); // show its saved portraits, if any
    setPortraitKeys(null); // keys aren't returned; the backend preserves them on save
    setSaveState('idle'); // a loaded character is already persisted
    setSheet(null); // a saved character has no source sheet to review
    swapAtlasUrl(c.atlasUrl); // presigned URL; loadAtlasTextures fetches it
    setStatus(`Loaded "${c.name}".`);
  };

  // A fresh page load (or coming back later) starts the creator blank, so the
  // fighter you just made isn't active until you pick it from "My characters" by
  // hand. Auto-load the most recent one as soon as the list arrives — once, and
  // only while nothing is active and no generation is mid-flight, so it never
  // overrides a character you're actively creating or editing.
  const autoLoadedRef = useRef(false);
  useEffect(() => {
    if (autoLoadedRef.current || !savedLoaded) return;
    if (character || busy || imgBusy || portraitBusy) {
      autoLoadedRef.current = true; // something's already active/in-flight — leave it
      return;
    }
    const newest = saved.find((c) => !c.archived); // backend returns newest-first
    if (newest) {
      autoLoadedRef.current = true;
      loadSaved(newest);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedLoaded, saved, character, busy, imgBusy, portraitBusy]);

  const removeSaved = async (c: CloudCharacter): Promise<void> => {
    if (!canPersist) return;
    if (!window.confirm(`Permanently delete "${c.name}"? This can't be undone.`)) return;
    try {
      if (!BACKEND_MODE) {
        await deleteLocalCharacter(c.characterId);
        await refreshSaved();
        return;
      }
      if (!API_BASE) return;
      const token = await getAccessToken();
      if (!token) return;
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
    if (!canPersist || !trimmed) return;
    try {
      if (!BACKEND_MODE) {
        await renameLocalCharacter(id, trimmed);
      } else {
        if (!API_BASE) return;
        const token = await getAccessToken();
        if (!token) return;
        await renameCloudCharacter(API_BASE, token, id, trimmed);
      }
      // Keep the loaded character's name in sync if it's the one being renamed.
      if (character?.meta.id === id) {
        setCharacter({ ...character, meta: { ...character.meta, name: trimmed } });
      }
      await refreshSaved();
      await refreshGallery();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const setArchived = async (id: string, archived: boolean): Promise<void> => {
    if (!canPersist) return;
    try {
      if (!BACKEND_MODE) {
        await archiveLocalCharacter(id, archived);
        await refreshSaved();
        return;
      }
      if (!API_BASE) return;
      const token = await getAccessToken();
      if (!token) return;
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

  const hasSprites = Boolean(atlasUrl);
  const activeSaved = saved.filter((c) => !c.archived);
  const archivedSaved = saved.filter((c) => c.archived);
  const photoMode = mode === 'photo';

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Create a fighter from a prompt or a photo, or{' '}
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
                    : 'Used for text/attribute generation, and to auto-name a photo fighter (optional for photos). Sent only to api.openai.com, never to any BrawlBox server.'}
                </p>
              </CardContent>
            </Card>
          )}

          {!ENV_FAL_KEY && !BACKEND_MODE && (
            <Card>
              <CardHeader>
                <CardTitle>fal.ai key</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Input
                  type="password"
                  placeholder="fal key (id:secret)"
                  value={falKeyInput}
                  onChange={(e) => persistFalKey(e.target.value, rememberFal)}
                  autoComplete="off"
                />
                <div className="flex items-center justify-between">
                  <Label htmlFor="remember-fal" className="text-muted-foreground">
                    Remember on this device
                  </Label>
                  <Switch
                    id="remember-fal"
                    checked={rememberFal}
                    onCheckedChange={(v) => {
                      setRememberFal(v);
                      persistFalKey(falKeyInput, v);
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Drives the photo→fighter flow locally (portraits + sprite re-skin via
                  nano-banana-2). Sent only to fal.run, never to any BrawlBox server. Get one at
                  fal.ai/dashboard/keys.
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Create your fighter</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {/* Mode toggle: two distinct creation flows. */}
              <div className="grid grid-cols-2 gap-1 rounded-md bg-secondary/50 p-1">
                {(
                  [
                    ['attributes', 'From attributes'],
                    ['photo', 'From a photo'],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    onClick={() => switchMode(m)}
                    disabled={busy || imgBusy || portraitBusy}
                    className={`rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                      mode === m
                        ? 'bg-background shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

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

              {/* Attributes mode: structured choices define the fighter (stats +
                  art). Photo mode: notes are optional and steer the look. */}
              {!photoMode ? (
                <>
                  <AttributePicker attrs={attrs} onChange={setAttrs} disabled={busy || imgBusy} />
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="looknotes" className="text-muted-foreground">
                      Extra details (optional)
                    </Label>
                    <Textarea
                      id="looknotes"
                      rows={2}
                      value={lookNotes}
                      onChange={(e) => setLookNotes(e.target.value)}
                      disabled={busy || imgBusy}
                      placeholder="Anything the options don't cover — clothing, hair, colors, gear, vibe…"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div
                    className={`flex flex-col gap-1.5 rounded-md border border-dashed p-3 transition-colors ${
                      dragOver ? 'border-primary bg-secondary/40' : 'border-input'
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (!busy && !imgBusy && !portraitBusy) setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      if (busy || imgBusy || portraitBusy) return;
                      const file = Array.from(e.dataTransfer.files).find((f) =>
                        f.type.startsWith('image/'),
                      );
                      if (file) void onPickImage(file);
                      else setError('Drop an image file (PNG/JPG).');
                    }}
                  >
                    <Label htmlFor="refimg" className="text-muted-foreground">
                      Reference photo
                    </Label>
                    <input
                      id="refimg"
                      type="file"
                      accept="image/*"
                      disabled={busy || imgBusy || portraitBusy}
                      onChange={(e) => void onPickImage(e.target.files?.[0])}
                      className="text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Drag &amp; drop or choose a face or full-body photo — we generate matching
                      front/back/headshot art and use it to skin your fighter.
                    </p>
                    {refImage && (
                      <img
                        src={refImage}
                        alt="reference"
                        className="mt-1 h-28 w-auto rounded-md border border-input object-contain"
                      />
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="notes" className="text-muted-foreground">
                      Notes (optional)
                    </Label>
                    <Textarea
                      id="notes"
                      rows={2}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Add notes to steer the look; the name & description come from your photo"
                    />
                  </div>
                </>
              )}

              <Button onClick={generate} disabled={busy || imgBusy || portraitBusy}>
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
                  {/* Only the freeform path uses this OpenAI per-pose model.
                      Template flows (incl. every photo flow) re-skin via NB2
                      (nano-banana-2), so the field would be misleading there. */}
                  {!BACKEND_MODE && !template && (
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
                  {photoMode ? (
                    // One step: portraits → sprites. Status shows on the Portraits tab.
                    <Button
                      variant="secondary"
                      onClick={() => void generateFromPhoto()}
                      disabled={busy || imgBusy || portraitBusy || !refImage}
                    >
                      {portraitBusy
                        ? 'Generating portraits…'
                        : imgBusy
                          ? 'Generating sprites…'
                          : `2 · ${hasSprites ? 'Regenerate' : 'Generate'} portraits & sprites`}
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={() => void generateSprites()}
                      disabled={busy || imgBusy || portraitBusy}
                    >
                      {imgBusy
                        ? hasSprites || BACKEND_MODE
                          ? 'Generating sprites…'
                          : `Generating sprites… ${imgProgress?.done ?? 0}/${imgProgress?.total ?? '?'}`
                        : `2 · ${hasSprites ? 'Regenerate' : 'Generate'} sprites`}
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {photoMode
                      ? 'Generates portraits, then re-skins the fighter from them — about 2–3 minutes. Watch progress on the Portraits tab.'
                      : BACKEND_MODE
                        ? 'Sprites are generated on the BrawlBox API (fal retexture). Takes about a minute.'
                        : 'Sprite generation makes one image API call per animation frame (billed to your key). Takes a minute or two.'}
                  </p>
                  {canPersist && saveState !== 'idle' && (
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
                          ? BACKEND_MODE
                            ? 'Saved to your collection — it will be here when you sign back in.'
                            : 'Saved to your collection — it will be here when you come back (this browser).'
                          : "Couldn't save to your collection (it's still here for now — try regenerating)."}
                    </p>
                  )}
                </>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}
              {status && <p className="text-sm text-primary">{status}</p>}
            </CardContent>
          </Card>

          {canPersist && (!BACKEND_MODE || user) && (
            <Card>
              <CardHeader>
                <CardTitle>My characters</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {savedError && <p className="text-sm text-destructive">{savedError}</p>}
                {!savedError && saved.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    {BACKEND_MODE
                      ? 'Characters you generate are saved here automatically and stay across sign-ins.'
                      : 'Characters you generate are saved here automatically, on this device.'}
                  </p>
                )}
                {activeSaved.map((c) => {
                  const isGenerating = c.characterId === generatingId;
                  // Another fighter is mid-generation → lock this row from loading.
                  const locked = imgBusy && !isGenerating;
                  return (
                    <div
                      key={c.characterId}
                      className={`flex items-center gap-2 ${isGenerating || locked ? 'opacity-70' : ''}`}
                    >
                      <Headshot
                        character={c.character}
                        atlasUrl={c.atlasUrl}
                        headshotUrl={c.portraitHeadshotUrl}
                        name={c.name}
                      />
                      {isGenerating ? (
                        <span className="flex-1 truncate text-sm font-medium">
                          {c.name}
                          <span className="ml-2 animate-pulse text-xs text-primary">
                            ● Generating sprites…
                          </span>
                        </span>
                      ) : renaming?.id === c.characterId ? (
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
                          className={`flex-1 truncate text-left text-sm ${
                            locked ? 'cursor-not-allowed' : 'hover:underline'
                          } ${character?.meta.id === c.characterId ? 'font-semibold text-primary' : ''}`}
                          onClick={() => loadSaved(c)}
                          disabled={locked}
                        >
                          {c.name}
                          {c.shared && <span className="ml-1 text-xs text-primary">· shared</span>}
                        </button>
                      )}
                      <div className="flex shrink-0 items-center gap-1">
                        {isGenerating ? (
                          <span className="text-xs text-muted-foreground">~2 min</span>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={locked}
                              onClick={() => setRenaming({ id: c.characterId, name: c.name })}
                            >
                              Rename
                            </Button>
                            {canCloud && (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={locked}
                                onClick={() => void toggleShare(c)}
                              >
                                {c.shared ? 'Unshare' : 'Share'}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={locked}
                              onClick={() => void setArchived(c.characterId, true)}
                            >
                              Archive
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}

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
                          <Headshot
                            character={c.character}
                            atlasUrl={c.atlasUrl}
                            headshotUrl={c.portraitHeadshotUrl}
                            name={c.name}
                          />
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
              <CardContent className="flex flex-col gap-2">
                {gallery.map((c) => (
                  <div key={c.characterId} className="flex items-center gap-2">
                    <Headshot
                      character={c.character}
                      atlasUrl={c.atlasUrl}
                      headshotUrl={c.portraitHeadshotUrl}
                      name={c.name}
                    />
                    <button
                      className={`flex-1 truncate text-left text-sm ${imgBusy ? 'cursor-not-allowed opacity-70' : 'hover:underline'}`}
                      onClick={() => loadSaved(c)}
                      disabled={imgBusy}
                    >
                      {c.name}
                    </button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right panel: Playtest / Attributes / Portraits */}
        <Card className="flex flex-col">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div className="flex gap-1 rounded-md bg-secondary/50 p-1">
              {(
                [
                  ['playtest', 'Playtest'],
                  ['controls', 'Controls'],
                  ['attributes', 'Attributes'],
                  ['portraits', 'Portraits'],
                ] as const
              ).map(([t, label]) => (
                <button
                  key={t}
                  onClick={() => setRightTab(t)}
                  className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                    rightTab === t
                      ? 'bg-background shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {rightTab === 'playtest' && (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                P1: WASD + J/K/L · P2: arrows + numpad · R restart · F1 debug
              </span>
            )}
          </CardHeader>
          <CardContent>
            {rightTab === 'playtest' && (
              <>
                <Playtest character={character} atlasUrl={atlasUrl} />
                <p className="mt-2 text-xs text-muted-foreground">
                  Both fighters are {character ? 'your character' : 'the base fighter'}. Pink (P1)
                  is the one you control; blue (P2) stands as an idle dummy so you can watch your
                  fighter take hits — react, dizzy, faint — while you attack.
                  {character &&
                    !hasSprites &&
                    ' Renders as a silhouette until you generate sprites.'}
                </p>
              </>
            )}

            {rightTab === 'controls' && <ControlsMap character={character} atlasUrl={atlasUrl} />}

            {rightTab === 'attributes' &&
              (character ? (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
                  <div className="flex flex-col gap-2">
                    <IdlePreview
                      // Show the live draft when it matches the loaded fighter;
                      // fall back to the committed character otherwise.
                      character={
                        previewCharacter?.meta.id === character.meta.id
                          ? previewCharacter
                          : character
                      }
                      atlasUrl={atlasUrl}
                      color={P1_COLOR}
                    />
                    <p className="text-xs text-muted-foreground">
                      Live preview of your edits — it follows the form as you type, but only{' '}
                      <span className="font-medium">Save changes</span> applies and saves them.
                    </p>
                  </div>
                  <AttributesForm
                    character={character}
                    onApply={applyAttributes}
                    onPreview={setPreviewCharacter}
                    busy={busy}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Generate or load a character to edit its stats.
                </p>
              ))}

            {rightTab === 'portraits' &&
              (portraitBusy || portraits || imgBusy ? (
                <div className="flex flex-col gap-3">
                  {portraitBusy && !portraits && (
                    <p className="animate-pulse text-sm text-primary">
                      ● Generating portraits… (~1–2 min)
                    </p>
                  )}
                  {portraits && (
                    <>
                      <div className="grid grid-cols-3 gap-2">
                        {(
                          [
                            ['Front', portraits.front],
                            ['Back', portraits.back],
                            ['Headshot', portraits.headshot],
                          ] as const
                        ).map(([label, url]) => (
                          <a
                            key={label}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex flex-col items-center gap-1"
                          >
                            <img
                              src={url}
                              alt={label}
                              className="aspect-[3/4] w-full rounded-md border border-input bg-white object-contain"
                            />
                            <span className="text-xs text-muted-foreground">{label}</span>
                          </a>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Generated from your reference. Front &amp; back skin the fighter; the
                        headshot is used as this character's thumbnail.
                      </p>
                    </>
                  )}
                  {imgBusy && (
                    <p className="animate-pulse text-sm text-primary">
                      ● Skinning the fighter (generating sprites)… it'll open in Playtest when
                      ready.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No portraits yet. Create a fighter “From a photo”, then generate portraits &amp;
                  sprites to get consistent front/back/headshot art.
                </p>
              ))}
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
