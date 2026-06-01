import { useState } from 'react';
import { cn } from '@/lib/utils.ts';
import type { PixelBox } from '@/creator/image/alpha.ts';

/**
 * Frame-review console (M2.3). The backend retextures a template into one sheet;
 * detectFrames + the template manifest produce a default spriteKey→frame mapping
 * that occasionally mis-assigns a pose (e.g. jump-fall). This lets the user see
 * the sheet with every detected frame numbered, see which frame each engine pose
 * currently uses, and re-map a bad pose by clicking a different frame — then the
 * parent re-packs the atlas and the live playtest updates.
 */
export interface FrameReviewProps {
  sheetUrl: string;
  /** Natural sheet dimensions, so overlays can position by percentage. */
  width: number;
  height: number;
  frames: PixelBox[];
  /** spriteKey -> index into `frames`. */
  selection: Record<string, number>;
  /** Called with the new selection when the user re-maps a pose. */
  onChange: (selection: Record<string, number>) => void;
  /** Re-pack in progress — disables interaction. */
  busy?: boolean;
}

const THUMB_W = 52;
const THUMB_H = 68;

/** CSS to show just `box` from the sheet, scaled to fit a THUMB_W×THUMB_H tile. */
function thumbStyle(
  box: PixelBox | undefined,
  sheetUrl: string,
  sheetW: number,
  sheetH: number,
): React.CSSProperties {
  if (!box) return {};
  const scale = Math.min(THUMB_W / box.w, THUMB_H / box.h);
  return {
    backgroundImage: `url(${sheetUrl})`,
    backgroundRepeat: 'no-repeat',
    // Scale the whole sheet by `scale`, then shift so the box centers in the tile.
    backgroundSize: `${sheetW * scale}px ${sheetH * scale}px`,
    backgroundPosition: `${-box.x * scale + (THUMB_W - box.w * scale) / 2}px ${-box.y * scale + (THUMB_H - box.h * scale) / 2}px`,
  };
}

/** Percentage rect for an overlay box, so it scales with the displayed image. */
function pctRect(box: PixelBox, width: number, height: number): React.CSSProperties {
  return {
    left: `${(box.x / width) * 100}%`,
    top: `${(box.y / height) * 100}%`,
    width: `${(box.w / width) * 100}%`,
    height: `${(box.h / height) * 100}%`,
  };
}

export function FrameReview({
  sheetUrl,
  width,
  height,
  frames,
  selection,
  onChange,
  busy = false,
}: FrameReviewProps) {
  const keys = Object.keys(selection).sort();
  const [armed, setArmed] = useState<string | null>(keys[0] ?? null);

  // Which detected frame is currently assigned to the armed pose.
  const armedIndex = armed != null ? selection[armed] : undefined;

  const assign = (frameIndex: number): void => {
    if (armed == null || busy) return;
    if (selection[armed] === frameIndex) return;
    onChange({ ...selection, [armed]: frameIndex });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        {armed
          ? `Editing “${armed}”. Click a frame on the sheet to use it for this pose.`
          : 'Select a pose, then click a frame on the sheet.'}
      </p>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[180px_1fr]">
        {/* Pose list */}
        <div className="flex max-h-[420px] flex-col gap-1 overflow-auto pr-1">
          {keys.map((key) => {
            const box = frames[selection[key]!];
            return (
              <button
                key={key}
                disabled={busy}
                onClick={() => setArmed(key)}
                className={cn(
                  'flex items-center gap-2 rounded-md border p-1 text-left text-xs transition-colors',
                  armed === key
                    ? 'border-primary bg-primary/10'
                    : 'border-transparent hover:bg-secondary/60',
                  busy && 'opacity-60',
                )}
              >
                <span
                  className="shrink-0 rounded bg-secondary/40"
                  style={{
                    width: THUMB_W,
                    height: THUMB_H,
                    ...thumbStyle(box, sheetUrl, width, height),
                  }}
                />
                <span className="flex flex-col">
                  <span className="font-medium">{key}</span>
                  <span className="text-muted-foreground">frame #{selection[key]}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Sheet with numbered frame overlays */}
        <div className="relative self-start overflow-auto rounded-md border bg-[#111]">
          <div className="relative" style={{ width: '100%' }}>
            <img
              src={sheetUrl}
              alt="generated sprite sheet"
              className="block w-full select-none"
              draggable={false}
            />
            {frames.map((box, i) => {
              const isArmed = i === armedIndex;
              return (
                <button
                  key={i}
                  disabled={busy}
                  onClick={() => assign(i)}
                  title={`frame #${i}`}
                  className={cn(
                    'absolute flex items-start justify-end border-2 text-[9px] font-bold leading-none',
                    isArmed
                      ? 'border-primary bg-primary/20'
                      : 'border-white/30 hover:border-primary/70 hover:bg-primary/10',
                    busy && 'pointer-events-none',
                  )}
                  style={pctRect(box, width, height)}
                >
                  <span
                    className={cn(
                      'px-0.5',
                      isArmed ? 'bg-primary text-primary-foreground' : 'bg-black/60 text-white',
                    )}
                  >
                    {i}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
