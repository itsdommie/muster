import { useMemo, useState } from 'react';
import type { PackIndex, Scenario } from '@muster/shared';

interface Props {
  index: PackIndex;
  onPlay: (scenarioId: string) => void;
}

const matches = (s: Scenario, q: string): boolean => {
  const hay = `${s.name} ${s.summary ?? ''} ${s.tags.join(' ')} ${s.setup} ${s.objectives} ${s.victory} ${s.special ?? ''}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
};

const points = (s: Scenario): string | null => {
  const p = s.points;
  if (!p || (p.min === undefined && p.max === undefined)) return null;
  return p.min !== undefined && p.max !== undefined ? `${p.min}–${p.max} pts` : p.min !== undefined ? `${p.min}+ pts` : `up to ${p.max} pts`;
};

function Section({ title, text }: { title: string; text: string }) {
  return text ? <section><h4>{title}</h4><p>{text}</p></section> : null;
}

export function ScenariosView({ index, onPlay }: Props) {
  const all = index.pack.scenarios;
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const tags = useMemo(() => [...new Set(all.flatMap((s) => s.tags))].sort(), [all]);
  const shown = useMemo(() => all.filter((s) => (!tag || s.tags.includes(tag)) && matches(s, query)).sort((a, b) => a.name.localeCompare(b.name)), [all, query, tag]);
  const scenario = selected ? index.scenarios.get(selected) : undefined;

  if (all.length === 0) {
    return (
      <section className="panel pad">
        <h2>Scenarios</h2>
        <p className="muted">This data pack has no scenarios. Add a <code>scenarios</code> list to the pack (see <code>docs/pack-format.md</code>) and they will show up here, ready to attach to a game.</p>
      </section>
    );
  }

  const roll = () => {
    const pool = shown.length > 0 ? shown : all;
    setSelected(pool[Math.floor(Math.random() * pool.length)]!.id);
  };

  return (
    <div className="scenarios">
      <section className="panel scenario-list">
        <div className="panel-head">
          <h2>Scenarios</h2>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search scenarios" aria-label="Search scenarios" />
          {tags.length > 0 && (
            <div className="examples" role="group" aria-label="Tags">
              <button className={`chip${tag ? '' : ' on'}`} aria-pressed={!tag} onClick={() => setTag(null)}>All</button>
              {tags.map((t) => <button key={t} className={`chip${tag === t ? ' on' : ''}`} aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>{t}</button>)}
            </div>
          )}
          <div className="row-controls">
            <span className="muted small" role="status">{shown.length} of {all.length} scenarios</span>
            <button onClick={roll}>Pick one at random</button>
          </div>
        </div>
        <ul className="rows">
          {shown.map((s) => (
            <li key={s.id} className={s.id === selected ? 'on' : ''}>
              <button className="link" onClick={() => setSelected(s.id)} aria-current={s.id === selected}>
                <span className="name">{s.name}</span>
                <span className="muted small">{s.summary ?? s.tags.join(', ')}</span>
              </button>
              {points(s) && <span className="muted small">{points(s)}</span>}
            </li>
          ))}
          {shown.length === 0 && <li className="muted pad">No scenarios match.</li>}
        </ul>
      </section>

      {scenario ? (
        <article className="panel scenario-detail" aria-label={scenario.name}>
          <div className="panel-head">
            <h2>{scenario.name}</h2>
            <p className="muted small">
              {[scenario.players && `${scenario.players} players`, points(scenario), ...scenario.tags].filter(Boolean).join(' · ')}
            </p>
            {scenario.summary && <p>{scenario.summary}</p>}
            <div className="actions flush">
              <button className="primary" onClick={() => onPlay(scenario.id)}>Play this scenario</button>
              <CopyButton text={scenarioText(scenario)} />
            </div>
          </div>
          <div className="scenario-body">
            <Section title="Set-up" text={scenario.setup} />
            <Section title="Objectives" text={scenario.objectives} />
            <Section title="Winning" text={scenario.victory} />
            <Section title="Special rules" text={scenario.special ?? ''} />
          </div>
        </article>
      ) : (
        <section className="panel pad muted">Choose a scenario to read it, or pick one at random.</section>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }, () => undefined); }}>
      {copied ? 'Copied' : 'Copy as text'}
    </button>
  );
}

export function scenarioText(s: Scenario): string {
  const out = [s.name, ''];
  const add = (title: string, text: string | undefined) => text && out.push(`${title}: ${text}`, '');
  add('Set-up', s.setup);
  add('Objectives', s.objectives);
  add('Winning', s.victory);
  add('Special rules', s.special);
  return out.join('\n').trimEnd() + '\n';
}
