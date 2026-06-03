import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import type { Character } from '@/engine/schema.ts';

// Friendly, no-broken-references subset of the character the creator exposes for
// hand-tuning: identity + combat stats + body size. The state machine, anims,
// commands and atlas are left untouched (editing those needs the raw JSON).
interface Draft {
  name: string;
  life: string;
  attack: string;
  defence: string;
  walkFwd: string;
  walkBack: string;
  jumpX: string;
  jumpY: string;
  gravity: string;
  groundFriction: string;
  width: string;
  height: string;
}

const toDraft = (c: Character): Draft => ({
  name: c.meta.name,
  life: String(c.data.life),
  attack: String(c.data.attack),
  defence: String(c.data.defence),
  walkFwd: String(c.data.walkFwd),
  walkBack: String(c.data.walkBack),
  jumpX: String(c.data.jumpVel.x),
  jumpY: String(c.data.jumpVel.y),
  gravity: String(c.data.gravity),
  groundFriction: String(c.data.groundFriction),
  width: String(c.size.width),
  height: String(c.size.height),
});

const NUMERIC: ReadonlyArray<{
  key: keyof Draft;
  label: string;
  hint?: string;
  /** Validation predicate; the field is rejected when it returns false. */
  ok?: (n: number) => boolean;
  step?: string;
}> = [
  { key: 'life', label: 'Health', hint: 'Max HP', ok: (n) => n > 0 },
  { key: 'attack', label: 'Attack', hint: 'Damage scale' },
  { key: 'defence', label: 'Defence', hint: 'Damage taken scale' },
  { key: 'walkFwd', label: 'Walk forward', hint: 'px / tick' },
  { key: 'walkBack', label: 'Walk back', hint: 'px / tick' },
  { key: 'jumpX', label: 'Jump speed (x)', step: '0.1' },
  { key: 'jumpY', label: 'Jump power (y)', step: '0.1' },
  { key: 'gravity', label: 'Gravity', ok: (n) => n >= 0, step: '0.1' },
  {
    key: 'groundFriction',
    label: 'Ground friction',
    hint: '0–1',
    ok: (n) => n >= 0 && n <= 1,
    step: '0.05',
  },
  { key: 'width', label: 'Body width', hint: 'px', ok: (n) => n > 0 },
  { key: 'height', label: 'Body height', hint: 'px', ok: (n) => n > 0 },
];

/**
 * Editable view of a character's friendly attributes (replaces the raw
 * character.json dump). Editing is non-destructive: `onPreview` fires on every
 * valid keystroke so the live idle preview reflects the draft, but nothing is
 * persisted until "Save changes" rebuilds the Character and hands it to
 * `onApply` (which updates the playtest canvas and saves the record).
 */
export function AttributesForm({
  character,
  onApply,
  onPreview,
  busy = false,
}: {
  character: Character;
  onApply: (next: Character) => void;
  /** Called with the draft-applied character whenever the (valid) draft changes. */
  onPreview?: (preview: Character) => void;
  busy?: boolean;
}): React.JSX.Element {
  const [draft, setDraft] = useState<Draft>(() => toDraft(character));

  // Resync whenever a different (or regenerated) character flows in. During
  // editing the parent's `character` is stable, so this never clobbers typing;
  // after a save the applied values already match, so it's a no-op.
  useEffect(() => setDraft(toDraft(character)), [character]);

  const set = (key: keyof Draft, value: string): void =>
    setDraft((d) => ({ ...d, [key]: value }));

  // Validate every numeric field; collect the first offending label for a hint.
  const invalid = useMemo(() => {
    for (const f of NUMERIC) {
      const n = Number(draft[f.key]);
      if (draft[f.key].trim() === '' || !Number.isFinite(n)) return f.label;
      if (f.ok && !f.ok(n)) return f.label;
    }
    return draft.name.trim() === '' ? 'Name' : null;
  }, [draft]);

  // Build the Character a draft describes, or null when any field is invalid.
  const build = (d: Draft): Character | null => {
    for (const f of NUMERIC) {
      const n = Number(d[f.key]);
      if (d[f.key].trim() === '' || !Number.isFinite(n)) return null;
      if (f.ok && !f.ok(n)) return null;
    }
    if (d.name.trim() === '') return null;
    const num = (k: keyof Draft) => Number(d[k]);
    return {
      ...character,
      meta: { ...character.meta, name: d.name.trim() },
      data: {
        ...character.data,
        life: num('life'),
        attack: num('attack'),
        defence: num('defence'),
        walkFwd: num('walkFwd'),
        walkBack: num('walkBack'),
        jumpVel: { x: num('jumpX'), y: num('jumpY') },
        gravity: num('gravity'),
        groundFriction: num('groundFriction'),
      },
      size: { ...character.size, width: num('width'), height: num('height') },
    };
  };

  // Push the draft into the preview on every change. While a field is invalid we
  // fall back to the committed character so the preview stays sensible.
  useEffect(() => {
    onPreview?.(build(draft) ?? character);
    // build() closes over `character`; re-run when either changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, character]);

  const dirty = useMemo(() => {
    const base = toDraft(character);
    return (Object.keys(base) as (keyof Draft)[]).some((k) => base[k] !== draft[k]);
  }, [draft, character]);

  const save = (): void => {
    const next = build(draft);
    if (next) onApply(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="attr-name" className="text-muted-foreground">
          Name
        </Label>
        <Input
          id="attr-name"
          value={draft.name}
          onChange={(e) => set('name', e.target.value)}
          disabled={busy}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {NUMERIC.map((f) => {
          const n = Number(draft[f.key]);
          const bad =
            draft[f.key].trim() === '' || !Number.isFinite(n) || (f.ok ? !f.ok(n) : false);
          return (
            <div key={f.key} className="flex flex-col gap-1.5">
              <Label htmlFor={`attr-${f.key}`} className="text-muted-foreground">
                {f.label}
                {f.hint && <span className="ml-1 text-[10px] opacity-70">({f.hint})</span>}
              </Label>
              <Input
                id={`attr-${f.key}`}
                type="number"
                step={f.step ?? '1'}
                value={draft[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                disabled={busy}
                className={bad ? 'border-destructive' : undefined}
              />
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={busy || !dirty || Boolean(invalid)}>
          {busy ? 'Saving…' : 'Save changes'}
        </Button>
        {invalid ? (
          <span className="text-xs text-destructive">Check “{invalid}”.</span>
        ) : dirty ? (
          <span className="text-xs text-muted-foreground">
            Applies to the playtest and saves to your collection.
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">No unsaved changes.</span>
        )}
      </div>
    </div>
  );
}
