import { useId, useState, type ReactNode } from 'react';

// Small form pieces shared by the pack editor. Every field is a real labelled control, so it works with a keyboard and a screen reader.

export function Text({ label, value, onChange, multiline, placeholder, hint, readOnly }: {
  label: string; value: string; onChange: (v: string) => void; multiline?: boolean; placeholder?: string; hint?: string; readOnly?: boolean;
}) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      {multiline
        ? <textarea id={id} rows={3} value={value} placeholder={placeholder} readOnly={readOnly} onChange={(e) => onChange(e.target.value)} />
        : <input id={id} value={value} placeholder={placeholder} readOnly={readOnly} onChange={(e) => onChange(e.target.value)} />}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}

/** A whole number, or (with `empty`) a number that may be left blank. Typing a partial value is allowed; the value is committed as it parses. */
export function Num({ label, value, onChange, min = 0, max, empty, hint, step }: {
  label: string; value: number | null; onChange: (v: number | null) => void; min?: number; max?: number; empty?: boolean; hint?: string; step?: number;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null ? '' : String(value));
  return (
    <label className="field num" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id} type="number" inputMode="decimal" min={min} {...(max !== undefined ? { max } : {})} {...(step !== undefined ? { step } : {})} value={shown}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          if (raw.trim() === '') { if (empty) onChange(null); return; }
          const n = Number(raw);
          if (Number.isFinite(n) && n >= min && (max === undefined || n <= max)) onChange(n);
        }}
        onBlur={() => setDraft(null)}
      />
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}

export function Check({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="field check">
      <span><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}</span>
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}

/** Choose any number of things from a list, as toggle buttons. */
export function Chips({ label, options, selected, onToggle, empty }: {
  label: string; options: { id: string; label: string }[]; selected: string[]; onToggle: (id: string) => void; empty?: string;
}) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="chips" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.id} type="button" className={selected.includes(o.id) ? 'chip on' : 'chip'} aria-pressed={selected.includes(o.id)} onClick={() => onToggle(o.id)}>{o.label}</button>
        ))}
        {options.length === 0 && <span className="muted small">{empty ?? 'Nothing to choose from yet.'}</span>}
      </div>
    </div>
  );
}

export function Group({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <fieldset className="group">
      <legend>{title}</legend>
      {hint && <p className="muted small">{hint}</p>}
      {children}
    </fieldset>
  );
}

export const csvList = (s: string): string[] => s.split(',').map((x) => x.trim()).filter(Boolean);

/** A comma-separated list in a text box. The text is kept as typed, so a trailing comma does not vanish while you are still typing. */
export function CsvField({ label, values, onChange, hint, placeholder }: { label: string; values: string[]; onChange: (v: string[]) => void; hint?: string; placeholder?: string }) {
  const [text, setText] = useState(values.join(', '));
  return <Text label={label} value={text} placeholder={placeholder ?? ''} {...(hint ? { hint } : {})} onChange={(v) => { setText(v); onChange(csvList(v)); }} />;
}
