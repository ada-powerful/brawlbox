import { cn } from '@/lib/utils.ts';
import type { Character, FrameRect } from '@/engine/schema.ts';
import { GROUP_COLORS, type ActionGroup } from '@/render/poses.ts';
import {
  buildControlsMap,
  type ControlRow,
  type InputVariant,
} from '@/creator/controlsMap.ts';

/**
 * "Controls" tab for the creator: the frames↔buttons map. For every action it
 * shows the keys/commands that trigger it (P1 bindings) alongside thumbnails of
 * that action's animation frames, then lists the passive actions (idle, hit
 * reactions, KO/win) that play automatically with no input.
 */
export function ControlsMap({
  character,
  atlasUrl,
}: {
  character: Character | null;
  atlasUrl?: string;
}): React.JSX.Element {
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
        <Kbd>L</Kbd>. Each row maps the press to the animation frames it plays.
      </p>

      <Section
        title="Inputs"
        subtitle="Actions you trigger with a key or command"
        rows={inputs}
        atlasFrames={atlasFrames}
        sheetUrl={sheetUrl}
      />

      <Section
        title="Passive"
        subtitle="Plays automatically — idle, reactions to being hit, match flow"
        rows={passive}
        atlasFrames={atlasFrames}
        sheetUrl={sheetUrl}
      />

      {!sheetUrl && (
        <p className="text-xs text-muted-foreground">
          Frame thumbnails appear once sprites are generated — until then each action shows its
          frame count.
        </p>
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
}: {
  title: string;
  subtitle: string;
  rows: ControlRow[];
  atlasFrames: Record<string, FrameRect> | undefined;
  sheetUrl: string | undefined;
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
          <Row key={row.id} row={row} atlasFrames={atlasFrames} sheetUrl={sheetUrl} />
        ))}
      </div>
    </div>
  );
}

function Row({
  row,
  atlasFrames,
  sheetUrl,
}: {
  row: ControlRow;
  atlasFrames: Record<string, FrameRect> | undefined;
  sheetUrl: string | undefined;
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
      <FrameStrip frames={row.frames} atlasFrames={atlasFrames} sheetUrl={sheetUrl} />
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
  frames,
  atlasFrames,
  sheetUrl,
}: {
  frames: string[];
  atlasFrames: Record<string, FrameRect> | undefined;
  sheetUrl: string | undefined;
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
        <Thumb key={i} rect={atlasFrames![sprite]} sprite={sprite} sheetUrl={sheetUrl!} />
      ))}
      {overflow > 0 && <span className="text-xs text-muted-foreground">+{overflow}</span>}
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
}: {
  rect: FrameRect | undefined;
  sprite: string;
  sheetUrl: string;
}): React.JSX.Element {
  if (!rect) {
    return (
      <span
        title={`${sprite} (unmapped)`}
        className="shrink-0 rounded border border-dashed border-input bg-secondary/30"
        style={{ width: THUMB_W, height: THUMB_H }}
      />
    );
  }
  const scale = Math.min(THUMB_W / rect.w, THUMB_H / rect.h);
  const padX = (THUMB_W - rect.w * scale) / 2;
  const padY = (THUMB_H - rect.h * scale) / 2;
  return (
    <span
      title={sprite}
      className="relative shrink-0 overflow-hidden rounded border border-input bg-secondary/30"
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
    </span>
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
