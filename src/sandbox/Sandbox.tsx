// Standalone engine sandbox. Boots a live match with `mountGame` and nothing
// else — NO auth, cloud, AI, or backend imports anywhere in this entry. Use it
// to test and debug engine behavior locally with a real character, touching
// only this repo. Reachable at /sandbox.html in dev and in the build.
import { useEffect, useRef, useState } from 'react';
import type { Character } from '@/engine/schema.ts';
import { mountGame, type GameHandle } from '@/game/mountGame.ts';
import { BASE_ATLAS_URL, BASE_CHARACTER, P1_COLOR, P2_COLOR } from '@/creator/defaults.ts';
import { bakeFromSheet } from './bake.ts';
import kyoSheetUrl from './kyo-sheet.webp';

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

export function Sandbox() {
  const mountRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<GameHandle | null>(null);
  const [fighters, setFighters] = useState<Fighter[]>([BASE_FIGHTER]);
  const [p1Id, setP1Id] = useState('base');
  const [p2Id, setP2Id] = useState('base');
  const [status, setStatus] = useState('Baking sheet character…');
  const [error, setError] = useState<string | null>(null);

  // Bake the bundled sheet into a real character once, in-browser. On success it
  // becomes the default P1 so the sandbox opens on the sprite-backed fighter.
  useEffect(() => {
    let disposed = false;
    let bakedUrl: string | null = null;
    bakeFromSheet(kyoSheetUrl, BASE_CHARACTER, { id: 'kyo', name: 'Kyo (sheet test)' })
      .then((baked) => {
        if (disposed) {
          URL.revokeObjectURL(baked.atlasUrl);
          return;
        }
        bakedUrl = baked.atlasUrl;
        setFighters((prev) => [
          ...prev,
          { id: 'kyo', label: 'Kyo (sheet sprites)', ...baked },
        ]);
        setP1Id('kyo');
        setStatus('Ready.');
      })
      .catch((e) => setError(`Sheet bake failed: ${(e as Error).message}`));
    return () => {
      disposed = true;
      if (bakedUrl) URL.revokeObjectURL(bakedUrl);
    };
  }, []);

  // (Re)mount the match whenever the selected fighters resolve or change.
  useEffect(() => {
    const mount = mountRef.current;
    const p1 = fighters.find((f) => f.id === p1Id);
    const p2 = fighters.find((f) => f.id === p2Id);
    if (!mount || !p1 || !p2) return;

    let disposed = false;
    handleRef.current?.destroy();
    handleRef.current = null;

    // Same fighter on both sides is fine — one shared def in the registry. The
    // roster ids are unique per character, so two different defs never collide.
    mountGame(mount, {
      p1: { character: p1.character, atlasUrl: p1.atlasUrl, color: P1_COLOR },
      p2: { character: p2.character, atlasUrl: p2.atlasUrl, color: P2_COLOR },
    })
      .then((h) => {
        if (disposed) h.destroy();
        else handleRef.current = h;
      })
      .catch((e) => setError(`Mount failed: ${(e as Error).message}`));

    return () => {
      disposed = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, [fighters, p1Id, p2Id]);

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
          <span style={{ color: '#ff5577' }}>P1</span>
          {picker(p1Id, setP1Id)}
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
          <span style={{ color: '#55aaff' }}>P2</span>
          {picker(p2Id, setP2Id)}
        </label>
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
      </div>

      <div ref={mountRef} style={{ border: '1px solid #333', borderRadius: 8, overflow: 'hidden' }} />

      <p style={{ fontSize: 12, color: '#9a9aa5', margin: 0, textAlign: 'center' }}>
        P1: WASD move · J/K/L attack · P2: arrows + numpad · R restart · F1 / ` debug overlay
      </p>
      {error ? (
        <p style={{ fontSize: 13, color: '#ff6b6b' }}>{error}</p>
      ) : (
        <p style={{ fontSize: 12, color: '#9a9aa5' }}>{status}</p>
      )}
    </div>
  );
}
