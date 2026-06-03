import { useEffect, useRef } from 'react';
import type { Character } from '@/engine/schema.ts';
import { mountIdle, type IdleHandle } from '@/game/mountIdle.ts';

/**
 * A single fighter looping its idle stance, used beside the attributes editor.
 * The Pixi scene is mounted once per atlas; `character` changes (the live draft)
 * are pushed in via `setCharacter` so size/sprite tweaks update without a costly
 * remount. Nothing here persists — it's a pure preview of the unsaved draft.
 */
export function IdlePreview({
  character,
  atlasUrl,
  color,
}: {
  character: Character;
  atlasUrl?: string;
  color: number;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const handleRef = useRef<IdleHandle | null>(null);
  // Always hold the latest character so a change that lands mid-mount isn't lost.
  const charRef = useRef(character);
  charRef.current = character;

  // (Re)mount when the atlas or color changes — those need fresh textures.
  useEffect(() => {
    const mount = ref.current;
    if (!mount) return;
    let disposed = false;
    handleRef.current = null;
    mountIdle(mount, { character: charRef.current, atlasUrl, color })
      .then((h) => {
        if (disposed) {
          h.destroy();
          return;
        }
        handleRef.current = h;
        h.setCharacter(charRef.current); // apply anything that changed during mount
      })
      .catch((e) => console.error('idle preview mount failed', e));
    return () => {
      disposed = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, [atlasUrl, color]);

  // Live draft updates: cheap re-render of the same scene, no remount.
  useEffect(() => {
    handleRef.current?.setCharacter(character);
  }, [character]);

  return <div ref={ref} className="overflow-hidden rounded-lg border" />;
}
