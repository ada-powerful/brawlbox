import { useEffect, useRef, useState } from 'react';
import type { Character } from '@/engine/schema.ts';

// Display size of the square thumbnail, in CSS pixels.
const SIZE = 36;

/**
 * Small character portrait. Prefers the AI-generated headshot (a dedicated
 * portrait the creator bakes from the reference photo); when none was saved we
 * fall back to cropping the top square of the `stand` (idle) frame out of the
 * sprite atlas — no extra image-gen call — and finally to the name's initial.
 *
 * Both the headshot and atlas URLs are presigned, CORS-clean S3 GETs.
 */
export function Headshot({
  character,
  atlasUrl,
  headshotUrl,
  name,
}: {
  character: Character;
  atlasUrl?: string;
  /** Presigned URL of the generated headshot portrait, when one was saved. */
  headshotUrl?: string;
  name: string;
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  const [headshotOk, setHeadshotOk] = useState(true);

  const frames = character.spriteAtlas?.frames;
  // Prefer the idle pose; fall back to whatever frame exists first.
  const rect = frames ? (frames['stand'] ?? Object.values(frames)[0]) : undefined;

  // Reset the img fallback flag whenever a new headshot URL arrives.
  useEffect(() => setHeadshotOk(true), [headshotUrl]);
  const showHeadshot = Boolean(headshotUrl) && headshotOk;

  useEffect(() => {
    setDrawn(false);
    const canvas = canvasRef.current;
    // The generated headshot wins; only crop from the atlas as a fallback.
    if (showHeadshot || !atlasUrl || !rect || !canvas) return;

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
  }, [showHeadshot, atlasUrl, rect?.x, rect?.y, rect?.w, rect?.h]);

  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded bg-secondary/60 text-xs font-semibold text-muted-foreground"
      style={{ width: SIZE, height: SIZE }}
      aria-hidden
    >
      {showHeadshot ? (
        <img
          src={headshotUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setHeadshotOk(false)}
        />
      ) : drawn ? (
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
