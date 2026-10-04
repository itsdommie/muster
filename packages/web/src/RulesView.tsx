import { useEffect, useMemo, useState } from 'react';
import { ruleCategories, searchRules, searchWargear, unitsWithRule, type PackIndex } from '@muster/shared';

interface Props {
  index: PackIndex;
  focusRule: string | null;
  onUnit: (unitId: string) => void;
}

type Section = 'rules' | 'wargear';

export function RulesView({ index, focusRule, onUnit }: Props) {
  const [section, setSection] = useState<Section>('rules');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | undefined>();

  // Following a link from a unit profile clears any filter that would hide the rule.
  useEffect(() => {
    if (!focusRule) return;
    setSection('rules');
    setQuery('');
    setCategory(undefined);
  }, [focusRule]);

  useEffect(() => {
    if (!focusRule) return;
    // After the cleared filters have rendered.
    const t = window.setTimeout(() => document.getElementById(`rule-${focusRule}`)?.scrollIntoView({ block: 'center' }), 0);
    return () => window.clearTimeout(t);
  }, [focusRule]);

  const categories = useMemo(() => ruleCategories(index), [index]);
  const rules = useMemo(() => searchRules(index, query, category), [index, query, category]);
  const wargear = useMemo(() => searchWargear(index, query), [index, query]);

  return (
    <div className="panel rules-view">
      <div className="panel-head">
        <div className="segmented" role="tablist" aria-label="Reference sections">
          <button role="tab" aria-selected={section === 'rules'} className={section === 'rules' ? 'on' : ''} onClick={() => setSection('rules')}>
            Special rules ({index.pack.rules.length})
          </button>
          <button role="tab" aria-selected={section === 'wargear'} className={section === 'wargear' ? 'on' : ''} onClick={() => setSection('wargear')}>
            Wargear ({index.pack.wargear.length})
          </button>
        </div>
        <input
          type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the reference"
          placeholder={section === 'rules' ? 'Search rules by name or text' : 'Search wargear'}
        />
        {section === 'rules' && categories.length > 0 && (
          <div className="examples" aria-label="Categories">
            <button className={`chip${category ? '' : ' on'}`} aria-pressed={!category} onClick={() => setCategory(undefined)}>All</button>
            {categories.map((c) => (
              <button key={c} className={`chip${category === c ? ' on' : ''}`} aria-pressed={category === c} onClick={() => setCategory(category === c ? undefined : c)}>{c}</button>
            ))}
          </div>
        )}
        <p className="muted small" role="status">
          {section === 'rules' ? `${rules.length} rule${rules.length === 1 ? '' : 's'}` : `${wargear.length} item${wargear.length === 1 ? '' : 's'}`}
        </p>
      </div>

      {section === 'rules' && (
        <ul className="cards">
          {rules.map((r) => {
            const users = unitsWithRule(index, r.id);
            return (
              <li key={r.id} id={`rule-${r.id}`} className={r.id === focusRule ? 'card focus' : 'card'}>
                <h3>{r.name} {r.category && <span className="badge">{r.category}</span>}</h3>
                <p>{r.text}</p>
                {users.length > 0 && (
                  <p className="small muted">
                    Used by:{' '}
                    {users.map((u, i) => (
                      <span key={u.id}>
                        {i > 0 && ', '}
                        <button className="link" onClick={() => onUnit(u.id)}>{u.name}</button>
                      </span>
                    ))}
                  </p>
                )}
              </li>
            );
          })}
          {rules.length === 0 && <li className="muted pad">No rules match.</li>}
        </ul>
      )}

      {section === 'wargear' && (
        <ul className="cards">
          {wargear.map((w) => (
            <li key={w.id} className="card">
              <h3>{w.name} {w.tags.map((t) => <span key={t} className="badge">{t}</span>)}</h3>
              {w.description && <p>{w.description}</p>}
            </li>
          ))}
          {wargear.length === 0 && <li className="muted pad">No wargear matches.</li>}
        </ul>
      )}
    </div>
  );
}
