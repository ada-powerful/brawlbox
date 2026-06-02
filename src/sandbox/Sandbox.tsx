// Standalone engine sandbox. Boots a live match with `mountGame` and nothing
// else — NO auth, cloud, AI, or backend imports anywhere in this entry. Use it
// to test and debug engine behavior locally with a real character, touching
// only this repo. Reachable at /sandbox.html in dev and in the build.
import { useEffect, useRef, useState } from 'react';
import type { Character } from '@/engine/schema.ts';
import { mountGame, type GameHandle } from '@/game/mountGame.ts';
import { mountGallery, type GalleryHandle } from '@/game/mountGallery.ts';
import { BASE_ATLAS_URL, BASE_CHARACTER, P1_COLOR, P2_COLOR } from '@/creator/defaults.ts';
import { bakeFromSheet } from './bake.ts';
import { HONDA_CHARACTER } from './honda.ts';
import { KFM_TEMPLATE } from './kfmTemplate.ts';
import { KFM2_CHARACTER, KFM2_ATLAS_URL } from './kfm2.ts';
import kfmSheetUrl from './kfm-sheet.webp';
import { hillsideStage } from '../stages/hillside/index.ts';

interface Fighter {
  id: string;
  label: string;
  character: Character;
  /** Omit to render the procedural silhouette instead of atlas sprites. */
  atlasUrl?: string;
}

const BASE_FIGHTER: Fighter = {
  id: 'base',
  label: 'Base (placeholder atlas)',
  character: BASE_CHARACTER,
  atlasUrl: BASE_ATLAS_URL,
};

// E. Honda demo: charge specials, mash slap, meter super, command grab. Rendered
// PROCEDURALLY (no atlasUrl) so each action draws its own colour-coded silhouette
// — you can see headbutt (orange) vs super (gold) vs grab (green) vs block (blue)
// vs hit (red) vs thrown (purple). Inputs (P1): charge back→forward+U = Headbutt ·
// charge down→up+J = Splash · mash I = Hundred Slap · HCB+K = Oicho grab ·
// full meter + charge back→forward+U+O = Super Headbutt.
const HONDA_FIGHTER: Fighter = {
  id: 'honda',
  label: 'E. Honda (procedural action poses)',
  character: HONDA_CHARACTER,
};

// Full 36-action KFM from the complete reference sheet (pre-baked atlas). Stage 1:
// all rows mapped to animations — open the Action gallery to review each one.
const KFM2_FIGHTER: Fighter = {
  id: 'kfm2',
  label: 'KFM (full 36-action sheet)',
  character: KFM2_CHARACTER,
  atlasUrl: KFM2_ATLAS_URL,
};

type Mode = 'match' | 'gallery';

export function Sandbox() {
  const mountRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<GameHandle | null>(null);
  const galleryRef = useRef<GalleryHandle | null>(null);
  const [fighters, setFighters] = useState<Fighter[]>([BASE_FIGHTER, HONDA_FIGHTER, KFM2_FIGHTER]);
  const [p1Id, setP1Id] = useState('base');
  const [p2Id, setP2Id] = useState('base');
  const [mode, setMode] = useState<Mode>('match');
  const [freezeTimer, setFreezeTimer] = useState(false);
  const [infiniteHealth, setInfiniteHealth] = useState(false);
  const [status, setStatus] = useState('Baking sheet character…');
  const [error, setError] = useState<string | null>(null);

  // Bake the bundled sheet into a real character once, in-browser. On success it
  // becomes the default P1 so the sandbox opens on the sprite-backed fighter.
  useEffect(() => {
    let disposed = false;
    let bakedUrl: string | null = null;
    bakeFromSheet(kfmSheetUrl, KFM_TEMPLATE, { id: 'kfm', name: 'KFM (mapped actions)' })
      .then((baked) => {
        if (disposed) {
          URL.revokeObjectURL(baked.atlasUrl);
          return;
        }
        bakedUrl = baked.atlasUrl;
        setFighters((prev) => [
          ...prev,
          { id: 'kfm', label: 'KFM (sheet sprites)', ...baked },
        ]);
        setP1Id('kfm');
        setStatus('Ready.');
      })
      .catch((e) => setError(`Sheet bake failed: ${(e as Error).message}`));
    return () => {
      disposed = true;
      if (bakedUrl) URL.revokeObjectURL(bakedUrl);
    };
  }, []);

  // (Re)mount the match — or the action gallery — whenever the selection,
  // fighters, or mode change.
  useEffect(() => {
    const mount = mountRef.current;
    const p1 = fighters.find((f) => f.id === p1Id);
    const p2 = fighters.find((f) => f.id === p2Id);
    if (!mount || !p1 || !p2) return;

    let disposed = false;
    handleRef.current?.destroy();
    handleRef.current = null;
    galleryRef.current?.destroy();
    galleryRef.current = null;

    if (mode === 'gallery') {
      // Gallery cycles the selected fighter through ITS OWN actions (sprites when
      // the fighter has an atlas, else the procedural stick figure).
      mountGallery(mount, { character: p1.character, atlasUrl: p1.atlasUrl, color: P1_COLOR })
        .then((h) => {
          if (disposed) h.destroy();
          else galleryRef.current = h;
        })
        .catch((e) => setError(`Gallery mount failed: ${(e as Error).message}`));
    } else {
      // Same fighter on both sides is fine — one shared def in the registry. The
      // roster ids are unique per character, so two different defs never collide.
      mountGame(mount, {
        p1: { character: p1.character, atlasUrl: p1.atlasUrl, color: P1_COLOR },
        p2: { character: p2.character, atlasUrl: p2.atlasUrl, color: P2_COLOR },
        stage: hillsideStage,
      })
        .then((h) => {
          if (disposed) h.destroy();
          else {
            handleRef.current = h;
            h.setFreezeTimer(freezeTimer);
            h.setInfiniteHealth(infiniteHealth);
          }
        })
        .catch((e) => setError(`Mount failed: ${(e as Error).message}`));
    }

    return () => {
      disposed = true;
      handleRef.current?.destroy();
      handleRef.current = null;
      galleryRef.current?.destroy();
      galleryRef.current = null;
    };
  }, [fighters, p1Id, p2Id, mode]);

  // Push timer-freeze / infinite-health changes to the live match handle without
  // remounting, so toggling mid-round keeps the current state. Bind `T` (timer)
  // and `H` (health) to toggle them.
  useEffect(() => {
    if (mode !== 'match') return;
    handleRef.current?.setFreezeTimer(freezeTimer);
    handleRef.current?.setInfiniteHealth(infiniteHealth);
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === 'KeyT') setFreezeTimer((v) => !v);
      else if (e.code === 'KeyH') setInfiniteHealth((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [freezeTimer, infiniteHealth, mode]);

  // Gallery keyboard controls: ←/→ step, space play/pause.
  useEffect(() => {
    if (mode !== 'gallery') return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === 'ArrowRight') galleryRef.current?.next();
      else if (e.code === 'ArrowLeft') galleryRef.current?.prev();
      else if (e.code === 'Space') {
        e.preventDefault();
        galleryRef.current?.togglePlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  const picker = (value: string, onChange: (id: string) => void) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ padding: '4px 8px', borderRadius: 6, background: '#1c1c22', color: '#eee', border: '1px solid #333' }}
    >
      {fighters.map((f) => (
        <option key={f.id} value={f.id}>
          {f.label}
        </option>
      ))}
    </select>
  );

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0e0e12',
        color: '#e6e6e6',
        fontFamily: 'system-ui, sans-serif',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>BrawlBox · engine sandbox</h1>
        <span style={{ fontSize: 12, color: '#9a9aa5' }}>local · no backend</span>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
          <span style={{ color: '#ff5577' }}>{mode === 'gallery' ? 'Fighter' : 'P1'}</span>
          {picker(p1Id, setP1Id)}
        </label>
        {mode === 'match' && (
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <span style={{ color: '#55aaff' }}>P2</span>
            {picker(p2Id, setP2Id)}
          </label>
        )}
        <button
          onClick={() => setMode((m) => (m === 'match' ? 'gallery' : 'match'))}
          style={{ padding: '4px 10px', borderRadius: 6, background: '#3a2e4e', color: '#eee', border: '1px solid #5a4a7a', cursor: 'pointer' }}
        >
          {mode === 'match' ? 'Action gallery →' : '← Back to match'}
        </button>
        {mode === 'match' ? (
          <>
            <button
              onClick={() => handleRef.current?.reset()}
              style={{ padding: '4px 10px', borderRadius: 6, background: '#26262e', color: '#eee', border: '1px solid #333', cursor: 'pointer' }}
            >
              Reset (R)
            </button>
            <button
              onClick={() => handleRef.current?.toggleDebug()}
              style={{ padding: '4px 10px', borderRadius: 6, background: '#26262e', color: '#eee', border: '1px solid #333', cursor: 'pointer' }}
            >
              Debug (F1)
            </button>
            <button
              onClick={() => setFreezeTimer((v) => !v)}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                background: freezeTimer ? '#2e4e3a' : '#26262e',
                color: '#eee',
                border: `1px solid ${freezeTimer ? '#4a7a5a' : '#333'}`,
                cursor: 'pointer',
              }}
            >
              {freezeTimer ? 'Timer frozen (T)' : 'Freeze timer (T)'}
            </button>
            <button
              onClick={() => setInfiniteHealth((v) => !v)}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                background: infiniteHealth ? '#2e4e3a' : '#26262e',
                color: '#eee',
                border: `1px solid ${infiniteHealth ? '#4a7a5a' : '#333'}`,
                cursor: 'pointer',
              }}
            >
              {infiniteHealth ? 'HP infinite (H)' : 'Infinite HP (H)'}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => galleryRef.current?.prev()}
              style={{ padding: '4px 10px', borderRadius: 6, background: '#26262e', color: '#eee', border: '1px solid #333', cursor: 'pointer' }}
            >
              ◀ Prev (←)
            </button>
            <button
              onClick={() => galleryRef.current?.togglePlay()}
              style={{ padding: '4px 10px', borderRadius: 6, background: '#26262e', color: '#eee', border: '1px solid #333', cursor: 'pointer' }}
            >
              Play/Pause (Space)
            </button>
            <button
              onClick={() => galleryRef.current?.next()}
              style={{ padding: '4px 10px', borderRadius: 6, background: '#26262e', color: '#eee', border: '1px solid #333', cursor: 'pointer' }}
            >
              Next (▶)
            </button>
          </>
        )}
      </div>

      <div ref={mountRef} style={{ border: '1px solid #333', borderRadius: 8, overflow: 'hidden' }} />

      <p style={{ fontSize: 12, color: '#9a9aa5', margin: 0, textAlign: 'center' }}>
        {mode === 'gallery'
          ? "Gallery: cycling the selected fighter's own actions · ←/→ step · Space play/pause · colour = action group"
          : 'P1: WASD move · J/K/L attack · P2: arrows + numpad · R restart · T freeze timer · H infinite HP · F1 / ` debug overlay'}
      </p>
      {error ? (
        <p style={{ fontSize: 13, color: '#ff6b6b' }}>{error}</p>
      ) : (
        <p style={{ fontSize: 12, color: '#9a9aa5' }}>{status}</p>
      )}
    </div>
  );
}
