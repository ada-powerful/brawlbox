import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils.ts';
import type { Character, FrameRect } from '@/engine/schema.ts';
import { GROUP_COLORS, type ActionGroup } from '@/render/poses.ts';
import { buildControlsMap, type ControlRow, type InputVariant } from '@/creator/controlsMap.ts';

/** A frame thumbnail was clicked: open the zoom view on this action's frames. */
export interface FrameZoom {
  /** Action id the frames belong to (shown as the zoom title). */
  action: string;
  /** All sprite keys for the action's animation, in order. */
  frames: string[];
  /** Index of the clicked frame within `frames`. */
  index: number;
}

export type OpenZoom = (zoom: FrameZoom) => void;

/**
 * "Controls" tab for the creator: the frames↔buttons map. For every action it
 * shows the keys/commands that trigger it (P1 bindings) alongside thumbnails of
 * that action's animation frames, then lists the passive actions (idle, hit
 * reactions, KO/win) that play automatically with no input. Clicking a thumbnail
 * opens a zoom overlay you can browse with ←/→.
 */
export function ControlsMap({
  character,
  atlasUrl,
}: {
  character: Character | null;
  atlasUrl?: string;
}): React.JSX.Element {
  const [zoom, setZoom] = useState<FrameZoom | null>(null);

  if (!character) {
    return (
      <p className="text-sm text-muted-foreground">
        Generate or load a character to see its controls.
      </p>
    );
  }

  const { inputs, passive } = buildControlsMap(character);
  const atlasFrames = character.spriteAtlas?.frames;
  const sheetUrl = atlasUrl;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs text-muted-foreground">
        Keys are P1 bindings. Move: <Kbd>W</Kbd>
        <Kbd>A</Kbd>
        <Kbd>S</Kbd>
        <Kbd>D</Kbd>. Attacks: <Kbd>U</Kbd>
        <Kbd>I</Kbd>
        <Kbd>O</Kbd> / <Kbd>J</Kbd>
        <Kbd>K</Kbd>
        <Kbd>L</Kbd>. Each row maps the press to the animation frames it plays.{' '}
        {sheetUrl && atlasFrames && <span>Click any frame to enlarge it.</span>}
      </p>

      <Section
        title="Inputs"
        subtitle="Actions you trigger with a key or command"
        rows={inputs}
        atlasFrames={atlasFrames}
        sheetUrl={sheetUrl}
        onOpen={setZoom}
      />

      <Section
        title="Passive"
        subtitle="Plays automatically — idle, reactions to being hit, match flow"
        rows={passive}
        atlasFrames={atlasFrames}
        sheetUrl={sheetUrl}
        onOpen={setZoom}
      />

      {!sheetUrl && (
        <p className="text-xs text-muted-foreground">
          Frame thumbnails appear once sprites are generated — until then each action shows its
          frame count.
        </p>
      )}

      {zoom && atlasFrames && sheetUrl && (
        <FrameLightbox
          zoom={zoom}
          atlasFrames={atlasFrames}
          sheetUrl={sheetUrl}
          onChange={setZoom}
          onClose={() => setZoom(null)}
        />
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  rows,
  atlasFrames,
  sheetUrl,
  onOpen,
}: {
  title: string;
  subtitle: string;
  rows: ControlRow[];
  atlasFrames: Record<string, FrameRect> | undefined;
  sheetUrl: string | undefined;
  onOpen: OpenZoom;
}): React.JSX.Element | null {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      </div>
      <div className="flex flex-col divide-y divide-border rounded-md border">
        {rows.map((row) => (
          <Row
            key={row.id}
            row={row}
            atlasFrames={atlasFrames}
            sheetUrl={sheetUrl}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
}

function Row({
  row,
  atlasFrames,
  sheetUrl,
  onOpen,
}: {
  row: ControlRow;
  atlasFrames: Record<string, FrameRect> | undefined;
  sheetUrl: string | undefined;
  onOpen: OpenZoom;
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-2 p-2 sm:grid-cols-[minmax(0,9rem)_minmax(0,12rem)_1fr] sm:items-center">
      {/* Action name + group */}
      <div className="flex flex-col">
        <span className="truncate text-sm font-medium" title={row.id}>
          {row.id}
        </span>
        <GroupBadge group={row.group} />
      </div>

      {/* Input(s), or a passive label */}
      <div className="flex flex-wrap gap-1.5">
        {row.inputs.length > 0 ? (
          row.inputs.map((v, i) => <InputChips key={i} variant={v} />)
        ) : (
          <span className="text-xs italic text-muted-foreground">automatic</span>
        )}
      </div>

      {/* Frame strip */}
      <FrameStrip
        action={row.id}
        frames={row.frames}
        atlasFrames={atlasFrames}
        sheetUrl={sheetUrl}
        onOpen={onOpen}
      />
    </div>
  );
}

function InputChips({ variant }: { variant: InputVariant }): React.JSX.Element {
  return (
    <span className="inline-flex flex-wrap items-center gap-1 rounded bg-secondary/40 px-1.5 py-1">
      {variant.from !== 'stand' && (
        <span className="text-[10px] text-muted-foreground">from {variant.from}:</span>
      )}
      {variant.keys.map((k, i) => (
        <Kbd key={`k${i}`}>{k}</Kbd>
      ))}
      {variant.release.map((k, i) => (
        <span key={`r${i}`} className="inline-flex items-center gap-0.5 text-[10px]">
          release <Kbd>{k}</Kbd>
        </span>
      ))}
      {variant.cmds.map((c, i) => (
        <span
          key={`c${i}`}
          className="rounded border border-input bg-background px-1 py-0.5 font-mono text-[11px]"
        >
          {c}
        </span>
      ))}
      {variant.conditions.map((cond, i) => (
        <span key={`cond${i}`} className="text-[10px] italic text-muted-foreground">
          {cond}
        </span>
      ))}
    </span>
  );
}

const MAX_THUMBS = 12;
const THUMB_W = 38;
const THUMB_H = 50;

function FrameStrip({
  action,
  frames,
  atlasFrames,
  sheetUrl,
  onOpen,
}: {
  action: string;
  frames: string[];
  atlasFrames: Record<string, FrameRect> | undefined;
  sheetUrl: string | undefined;
  onOpen: OpenZoom;
}): React.JSX.Element {
  if (frames.length === 0) {
    return <span className="text-xs text-muted-foreground">no frames</span>;
  }

  const canThumb = Boolean(sheetUrl && atlasFrames);
  if (!canThumb) {
    return (
      <span className="text-xs text-muted-foreground">
        {frames.length} frame{frames.length === 1 ? '' : 's'}
      </span>
    );
  }

  const shown = frames.slice(0, MAX_THUMBS);
  const overflow = frames.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((sprite, i) => (
        <Thumb
          key={i}
          rect={atlasFrames![sprite]}
          sprite={sprite}
          sheetUrl={sheetUrl!}
          onClick={() => onOpen({ action, frames, index: i })}
        />
      ))}
      {overflow > 0 && (
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={() => onOpen({ action, frames, index: MAX_THUMBS })}
        >
          +{overflow}
        </button>
      )}
    </div>
  );
}

/**
 * One frame thumbnail. The full atlas is rendered as an absolutely-positioned
 * <img> inside a clipping tile and transformed so just `rect` shows, scaled to
 * fit and centered. A transform avoids needing the atlas's natural dimensions
 * (which background-position cropping would require).
 */
function Thumb({
  rect,
  sprite,
  sheetUrl,
  onClick,
}: {
  rect: FrameRect | undefined;
  sprite: string;
  sheetUrl: string;
  onClick: () => void;
}): React.JSX.Element {
  if (!rect) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={`${sprite} (unmapped) — click to enlarge`}
        className="shrink-0 cursor-zoom-in rounded border border-dashed border-input bg-secondary/30"
        style={{ width: THUMB_W, height: THUMB_H }}
      />
    );
  }
  const scale = Math.min(THUMB_W / rect.w, THUMB_H / rect.h);
  const padX = (THUMB_W - rect.w * scale) / 2;
  const padY = (THUMB_H - rect.h * scale) / 2;
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${sprite} — click to enlarge`}
      className="relative shrink-0 cursor-zoom-in overflow-hidden rounded border border-input bg-secondary/30 hover:border-ring"
      style={{ width: THUMB_W, height: THUMB_H }}
    >
      <img
        src={sheetUrl}
        alt={sprite}
        draggable={false}
        className="max-w-none select-none"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transformOrigin: 'top left',
          transform: `translate(${padX}px, ${padY}px) scale(${scale}) translate(${-rect.x}px, ${-rect.y}px)`,
          imageRendering: 'pixelated',
        }}
      />
    </button>
  );
}

const ZOOM_W = 360;
const ZOOM_H = 460;

/**
 * Full-screen overlay showing one frame enlarged. ←/→ step through the action's
 * frames (clamped to its bounds), Esc or a backdrop click closes. The enlarged
 * frame reuses the atlas-crop transform from {@link Thumb}, scaled up to fill the
 * larger tile.
 */
function FrameLightbox({
  zoom,
  atlasFrames,
  sheetUrl,
  onChange,
  onClose,
}: {
  zoom: FrameZoom;
  atlasFrames: Record<string, FrameRect>;
  sheetUrl: string;
  onChange: (zoom: FrameZoom) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { action, frames, index } = zoom;
  const sprite = frames[index];
  const rect = sprite ? atlasFrames[sprite] : undefined;

  const step = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next < 0 || next >= frames.length) return;
      onChange({ action, frames, index: next });
    },
    [action, frames, index, onChange],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        step(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        step(1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, onClose]);

  const scale = rect ? Math.min(ZOOM_W / rect.w, ZOOM_H / rect.h) : 1;
  const padX = rect ? (ZOOM_W - rect.w * scale) / 2 : 0;
  const padY = rect ? (ZOOM_H - rect.h * scale) / 2 : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${action} frame ${index + 1} of ${frames.length}`}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/80 p-6"
      onClick={onClose}
    >
      <div className="flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1 text-sm text-white">
          <span className="font-semibold">{action}</span>
          <span className="text-white/60">
            · frame {index + 1} / {frames.length}
          </span>
          {sprite && <span className="ml-1 font-mono text-xs text-white/40">{sprite}</span>}
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            disabled={index <= 0}
            onClick={() => step(-1)}
            aria-label="Previous frame"
            className="rounded-full border border-white/30 px-3 py-2 text-lg text-white disabled:opacity-25 enabled:hover:bg-white/10"
          >
            ‹
          </button>

          <div
            className="relative overflow-hidden rounded-md border border-white/20 bg-black/40"
            style={{ width: ZOOM_W, height: ZOOM_H }}
          >
            {rect ? (
              <img
                src={sheetUrl}
                alt={sprite}
                draggable={false}
                className="max-w-none select-none"
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  transformOrigin: 'top left',
                  transform: `translate(${padX}px, ${padY}px) scale(${scale}) translate(${-rect.x}px, ${-rect.y}px)`,
                  imageRendering: 'pixelated',
                }}
              />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center text-sm text-white/50">
                {sprite ? 'unmapped frame' : 'no frame'}
              </span>
            )}
          </div>

          <button
            type="button"
            disabled={index >= frames.length - 1}
            onClick={() => step(1)}
            aria-label="Next frame"
            className="rounded-full border border-white/30 px-3 py-2 text-lg text-white disabled:opacity-25 enabled:hover:bg-white/10"
          >
            ›
          </button>
        </div>

        <p className="text-xs text-white/50">← / → to browse · Esc to close</p>
      </div>
    </div>
  );
}

function GroupBadge({ group }: { group: ActionGroup }): React.JSX.Element {
  const color = group === 'movement' ? 0x9ca3af : GROUP_COLORS[group];
  const hex = `#${color.toString(16).padStart(6, '0')}`;
  return (
    <span className="inline-flex w-fit items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: hex }} />
      {group}
    </span>
  );
}

function Kbd({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <kbd
      className={cn(
        'inline-flex min-w-[1.25rem] items-center justify-center rounded border border-input',
        'bg-background px-1 py-0.5 font-mono text-[11px] font-semibold shadow-sm',
      )}
    >
      {children}
    </kbd>
  );
}
