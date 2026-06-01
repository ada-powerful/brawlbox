import { useEffect, useRef, useState } from 'react';
import type { Character } from '@/engine/schema.ts';

// Display size of the square thumbnail, in CSS pixels.
const SIZE = 36;

/**
 * Small character portrait, cropped client-side from the already-generated
 * sprite atlas — no extra image-gen call. We crop the top square of the `stand`
 * (idle) frame, which biases toward the head/torso for a "headshot" look.
 *
 * The atlas URL is a presigned, CORS-clean S3 GET, so the canvas stays untainted.
 * Falls back to the character's initial while sprites are missing or loading.
 */
export function Headshot({
  character,
  atlasUrl,
  name,
}: {
  character: Character;
  atlasUrl?: string;
  name: string;
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);

  const frames = character.spriteAtlas?.frames;
  // Prefer the idle pose; fall back to whatever frame exists first.
  const rect = frames ? (frames['stand'] ?? Object.values(frames)[0]) : undefined;

  useEffect(() => {
    setDrawn(false);
    const canvas = canvasRef.current;
    if (!atlasUrl || !rect || !canvas) return;

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = SIZE * dpr;
      canvas.height = SIZE * dpr;
      ctx.imageSmoothingEnabled = false; // crisp pixels for sprite art
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Top square of the frame → head + upper body.
      const side = Math.min(rect.w, rect.h);
      ctx.drawImage(img, rect.x, rect.y, side, side, 0, 0, SIZE * dpr, SIZE * dpr);
      setDrawn(true);
    };
    img.onerror = () => {
      /* leave the fallback initial showing */
    };
    img.src = atlasUrl;
    return () => {
      cancelled = true;
    };
  }, [atlasUrl, rect?.x, rect?.y, rect?.w, rect?.h]);

  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded bg-secondary/60 text-xs font-semibold text-muted-foreground"
      style={{ width: SIZE, height: SIZE }}
      aria-hidden
    >
      {drawn ? (
        <canvas ref={canvasRef} style={{ width: SIZE, height: SIZE }} />
      ) : (
        <>
          {/* keep the canvas mounted so the ref exists for the draw effect */}
          <canvas ref={canvasRef} className="hidden" />
          <span>{(name.trim()[0] ?? '?').toUpperCase()}</span>
        </>
      )}
    </div>
  );
}
