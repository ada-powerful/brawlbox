import { Label } from '@/components/ui/label.tsx';
import {
  BODY,
  PHYSIQUE,
  SEX,
  STYLE,
  attributesToDescription,
  type Attributes,
  type BodyType,
  type MartialStyle,
  type Physique,
  type Sex,
} from '@/creator/attributes.ts';

// Explicit bg/text (not bg-transparent) so the opened option list is readable —
// a transparent select renders the popup white-on-white on a dark theme.
const SELECT =
  'h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm ' +
  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50';
const OPT = 'bg-background text-foreground';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-muted-foreground">
        {label}
        {hint && <span className="ml-1 text-[10px] opacity-70">({hint})</span>}
      </Label>
      {children}
    </div>
  );
}

/**
 * Structured character builder: sex + body type + physique + martial style. These
 * drive both the engine stats/size and the art (via `attributesToDescription`),
 * so the fighter is defined by choices rather than a free-text prompt.
 */
export function AttributePicker({
  attrs,
  onChange,
  disabled = false,
}: {
  attrs: Attributes;
  onChange: (next: Attributes) => void;
  disabled?: boolean;
}): React.JSX.Element {
  const set = <K extends keyof Attributes>(key: K, value: Attributes[K]): void =>
    onChange({ ...attrs, [key]: value });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sex">
          <select
            className={SELECT}
            value={attrs.sex}
            disabled={disabled}
            onChange={(e) => set('sex', e.target.value as Sex)}
          >
            {(Object.keys(SEX) as Sex[]).map((k) => (
              <option key={k} value={k} className={OPT}>
                {SEX[k].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Martial style">
          <select
            className={SELECT}
            value={attrs.style}
            disabled={disabled}
            onChange={(e) => set('style', e.target.value as MartialStyle)}
          >
            {(Object.keys(STYLE) as MartialStyle[]).map((k) => (
              <option key={k} value={k} disabled={!STYLE[k].available} className={OPT}>
                {STYLE[k].label}
                {STYLE[k].available ? '' : ' — coming soon'}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Body type">
        <select
          className={SELECT}
          value={attrs.body}
          disabled={disabled}
          onChange={(e) => set('body', e.target.value as BodyType)}
        >
          {(Object.keys(BODY) as BodyType[]).map((k) => (
            <option key={k} value={k} className={OPT}>
              {BODY[k].label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Physique">
        <select
          className={SELECT}
          value={attrs.physique}
          disabled={disabled}
          onChange={(e) => set('physique', e.target.value as Physique)}
        >
          {(Object.keys(PHYSIQUE) as Physique[]).map((k) => (
            <option key={k} value={k} className={OPT}>
              {PHYSIQUE[k].label}
            </option>
          ))}
        </select>
      </Field>

      <p className="text-xs text-muted-foreground">{attributesToDescription(attrs)}</p>
    </div>
  );
}
