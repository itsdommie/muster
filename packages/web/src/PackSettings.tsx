import { packEdit, type PackDraft } from '@muster/shared';
import { Check, Group, Num, Text } from './editorKit';

type Combat = NonNullable<PackDraft['ruleset']['combat']>;
type Campaign = NonNullable<PackDraft['ruleset']['campaign']>;

const DEFAULT_COMBAT: Combat = { die: 6, tie: 'higher-fight', supportBonus: 0, wound: { base: 4, perPoint: 1, min: 2, max: 6 } };
const DEFAULT_CAMPAIGN: Campaign = { levels: [{ at: 0, name: 'Recruit' }], xp: { play: 1, win: 1, draw: 0 }, advancements: [], injuries: [] };

export function PackSettings({ draft, onChange }: { draft: PackDraft; onChange: (d: PackDraft) => void }) {
  const rs = draft.ruleset;
  const setRules = (patch: Partial<typeof rs>) => onChange({ ...draft, ruleset: { ...rs, ...patch } });
  const percent = (f: number) => Math.round(f * 1000) / 10;

  return (
    <div className="editor-stack">
      <section className="panel editor-form" aria-label="Pack details">
        <div className="panel-head"><h3>About this pack</h3></div>
        <div className="form-grid">
          <Text label="Name" value={draft.name} onChange={(v) => onChange({ ...draft, name: v })} />
          <Text label="Id" value={draft.id} readOnly onChange={() => undefined} hint="Fixed when the pack was made. Saved lists are tied to it." />
          <Text label="Version" value={draft.version} onChange={(v) => onChange({ ...draft, version: v })} />
          <Text label="Author" value={draft.author ?? ''} onChange={(v) => onChange({ ...draft, author: v === '' ? undefined : v })} />
          <Text label="Licence" value={draft.license ?? ''} onChange={(v) => onChange({ ...draft, license: v === '' ? undefined : v })} />
          <Text label="Description" multiline value={draft.description ?? ''} onChange={(v) => onChange({ ...draft, description: v === '' ? undefined : v })} />
        </div>
      </section>

      <section className="panel editor-form" aria-label="List-building rules">
        <div className="panel-head"><h3>List-building rules</h3></div>
        <div className="form-grid">
          <Num label="Warriors one hero can lead" value={rs.warbandSize} onChange={(v) => setRules({ warbandSize: v ?? 0 })} hint="Heroes can override this on their own page." />
          <Num label="Force is broken after losing (%)" value={percent(rs.break)} max={100} step={0.1} onChange={(v) => setRules({ break: (v ?? 0) / 100 })} />
          <Num label="Most models with bows or throwing weapons (%)" value={percent(rs.bowLimit)} max={100} step={0.1} onChange={(v) => setRules({ bowLimit: (v ?? 0) / 100 })} />
        </div>
        <Group title="Ally levels" hint="Names for how well armies get on, each with the most of a list that may be spent on allies of that level.">
          {Object.entries(rs.allyLimits).map(([level, cap]) => (
            <div className="option-row" key={level}>
              <Text label="Level" value={level} onChange={(v) => renameLevel(draft, level, v, onChange)} />
              <Num label="Cap (% of points)" value={cap} empty max={100} hint="Blank = no cap" onChange={(v) => setRules({ allyLimits: { ...rs.allyLimits, [level]: v } })} />
              <button className="icon" aria-label={`Remove ally level ${level}`} onClick={() => removeLevel(draft, level, onChange)}>×</button>
            </div>
          ))}
          <button onClick={() => setRules({ allyLimits: { ...rs.allyLimits, [freeName(Object.keys(rs.allyLimits), 'level')]: null } })}>Add an ally level</button>
        </Group>
      </section>

      <section className="panel editor-form" aria-label="Fight rules">
        <div className="panel-head">
          <h3>Fight rules</h3>
          <p className="muted small">What the fight calculator uses: a duel, strikes, wound rolls and saves. Leave them off if the game does not fit.</p>
        </div>
        <Check label="This pack has fight rules" checked={!!rs.combat} onChange={(v) => setRules({ combat: v ? DEFAULT_COMBAT : undefined })} />
        {rs.combat && <CombatForm combat={rs.combat} onChange={(combat) => setRules({ combat })} />}
      </section>

      <section className="panel editor-form" aria-label="Campaign rules">
        <div className="panel-head">
          <h3>Campaign rules</h3>
          <p className="muted small">How a company grows: experience levels, what a game awards, and the advancements and injuries to choose from.</p>
        </div>
        <Check label="This pack has campaign rules" checked={!!rs.campaign} onChange={(v) => setRules({ campaign: v ? DEFAULT_CAMPAIGN : undefined })} />
        {rs.campaign && <CampaignForm campaign={rs.campaign} onChange={(campaign) => setRules({ campaign })} />}
      </section>
    </div>
  );
}

const freeName = (taken: string[], base: string): string => packEdit.uniqueId(base, taken);

/** Renaming a level renames it on every army that uses it too. */
function renameLevel(d: PackDraft, from: string, to: string, onChange: (d: PackDraft) => void) {
  if (to === from || to.trim() === '' || to in d.ruleset.allyLimits) return;
  const allyLimits = Object.fromEntries(Object.entries(d.ruleset.allyLimits).map(([k, v]) => [k === from ? to : k, v]));
  onChange({ ...d, ruleset: { ...d.ruleset, allyLimits }, armies: d.armies.map((a) => ({ ...a, allies: a.allies.map((al) => (al.level === from ? { ...al, level: to } : al)) })) });
}

/** Removing a level removes the alliances that used it. */
function removeLevel(d: PackDraft, level: string, onChange: (d: PackDraft) => void) {
  const { [level]: _gone, ...allyLimits } = d.ruleset.allyLimits;
  onChange({ ...d, ruleset: { ...d.ruleset, allyLimits }, armies: d.armies.map((a) => ({ ...a, allies: a.allies.filter((al) => al.level !== level) })) });
}

function CombatForm({ combat, onChange }: { combat: Combat; onChange: (c: Combat) => void }) {
  const w = combat.wound;
  return (
    <div className="form-grid">
      <Num label="Sides on the die" value={combat.die} min={2} max={20} onChange={(v) => onChange({ ...combat, die: v ?? 6 })} />
      <label className="field">
        <span>A tied duel</span>
        <select value={combat.tie} aria-label="A tied duel" onChange={(e) => onChange({ ...combat, tie: e.target.value as Combat['tie'] })}>
          <option value="higher-fight">Higher Fight wins (equal Fight is rolled again)</option>
          <option value="reroll">Roll again</option>
          <option value="coin">Toss a coin</option>
        </select>
      </label>
      <Num label="Extra strikes per supporting model" value={combat.supportBonus} onChange={(v) => onChange({ ...combat, supportBonus: v ?? 0 })} />
      {'table' in w ? (
        <div className="field">
          <span>To wound</span>
          <p className="muted small">This pack uses a table of wound rolls, which is edited on the Import &amp; JSON tab.</p>
          <button onClick={() => onChange({ ...combat, wound: { base: 4, perPoint: 1, min: 2, max: combat.die } })}>Replace it with a formula</button>
        </div>
      ) : (
        <Group title="To wound: roll at least  base + step × (Defence − Strength), kept between the smallest and largest">
          <div className="stat-grid">
            <Num label="Base" value={w.base} min={-20} onChange={(v) => onChange({ ...combat, wound: { ...w, base: v ?? 0 } })} />
            <Num label="Step" value={w.perPoint} onChange={(v) => onChange({ ...combat, wound: { ...w, perPoint: v ?? 0 } })} />
            <Num label="Smallest" value={w.min} min={-20} onChange={(v) => onChange({ ...combat, wound: { ...w, min: v ?? 0 } })} />
            <Num label="Largest" value={w.max} min={-20} onChange={(v) => onChange({ ...combat, wound: { ...w, max: v ?? 0 } })} />
          </div>
        </Group>
      )}
      <Check label="Fate points can cancel a wound" checked={!!combat.fate} onChange={(v) => onChange(withOptional(combat, 'fate', v ? { target: 4 } : undefined))} />
      {combat.fate && <Num label="Roll at least" value={combat.fate.target} min={1} onChange={(v) => onChange({ ...combat, fate: { target: v ?? 4 } })} />}
      <Check label="Might can be spent on a duel" checked={!!combat.might} onChange={(v) => onChange(withOptional(combat, 'might', v ? { duelBonus: 1 } : undefined))} />
      {combat.might && <Num label="Bonus per point spent" value={combat.might.duelBonus} onChange={(v) => onChange({ ...combat, might: { duelBonus: v ?? 1 } })} />}
    </div>
  );
}

function withOptional<T extends object, K extends string, V>(obj: T, key: K, value: V | undefined): T {
  const { [key]: _old, ...rest } = obj as Record<string, unknown>;
  return (value === undefined ? rest : { ...rest, [key]: value }) as T;
}

function CampaignForm({ campaign, onChange }: { campaign: Campaign; onChange: (c: Campaign) => void }) {
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
  return (
    <div className="form-grid">
      <Group title="Experience levels" hint="A model is at the highest level whose experience it has reached. The first must be at 0.">
        {campaign.levels.map((l, i) => (
          <div className="option-row" key={i}>
            <Text label={`Level ${i + 1} name`} value={l.name} onChange={(v) => onChange({ ...campaign, levels: campaign.levels.map((x, j) => (j === i ? { ...x, name: v } : x)) })} />
            <Num label="From experience" value={l.at} onChange={(v) => onChange({ ...campaign, levels: campaign.levels.map((x, j) => (j === i ? { ...x, at: v ?? 0 } : x)) })} />
            <button className="icon" aria-label={`Remove level ${l.name}`} onClick={() => onChange({ ...campaign, levels: campaign.levels.filter((_, j) => j !== i) })}>×</button>
          </div>
        ))}
        <button onClick={() => onChange({ ...campaign, levels: [...campaign.levels, { at: (campaign.levels.at(-1)?.at ?? -1) + 1, name: 'New level' }] })}>Add a level</button>
      </Group>
      <Group title="Experience awarded for a game">
        <div className="stat-grid">
          <Num label="For taking part" value={campaign.xp.play} onChange={(v) => onChange({ ...campaign, xp: { ...campaign.xp, play: v ?? 0 } })} />
          <Num label="Extra for a win" value={campaign.xp.win} onChange={(v) => onChange({ ...campaign, xp: { ...campaign.xp, win: v ?? 0 } })} />
          <Num label="Extra for a draw" value={campaign.xp.draw} onChange={(v) => onChange({ ...campaign, xp: { ...campaign.xp, draw: v ?? 0 } })} />
        </div>
      </Group>
      <Group title="Advancements" hint="Things a model can take as it levels up. “From level” is the position in the list above (0 is the first).">
        {campaign.advancements.map((a) => (
          <div className="option-row" key={a.id}>
            <Text label="Name" value={a.name} onChange={(v) => onChange({ ...campaign, advancements: campaign.advancements.map((x) => (x.id === a.id ? { ...x, name: v } : x)) })} />
            <Num label="From level" value={a.minLevel} onChange={(v) => onChange({ ...campaign, advancements: campaign.advancements.map((x) => (x.id === a.id ? { ...x, minLevel: v ?? 0 } : x)) })} />
            <Text label="What it does" value={a.text} onChange={(v) => onChange({ ...campaign, advancements: campaign.advancements.map((x) => (x.id === a.id ? { ...x, text: v } : x)) })} />
            <button className="icon" aria-label={`Remove advancement ${a.name}`} onClick={() => onChange({ ...campaign, advancements: campaign.advancements.filter((x) => x.id !== a.id) })}>×</button>
          </div>
        ))}
        <button onClick={() => onChange({ ...campaign, advancements: [...campaign.advancements, { id: packEdit.uniqueId('new-advancement', ids(campaign.advancements)), name: 'New advancement', text: '', minLevel: 0 }] })}>Add an advancement</button>
      </Group>
      <Group title="Injuries">
        {campaign.injuries.map((inj) => (
          <div className="option-row" key={inj.id}>
            <Text label="Name" value={inj.name} onChange={(v) => onChange({ ...campaign, injuries: campaign.injuries.map((x) => (x.id === inj.id ? { ...x, name: v } : x)) })} />
            <Text label="What it does" value={inj.text} onChange={(v) => onChange({ ...campaign, injuries: campaign.injuries.map((x) => (x.id === inj.id ? { ...x, text: v } : x)) })} />
            <button className="icon" aria-label={`Remove injury ${inj.name}`} onClick={() => onChange({ ...campaign, injuries: campaign.injuries.filter((x) => x.id !== inj.id) })}>×</button>
          </div>
        ))}
        <button onClick={() => onChange({ ...campaign, injuries: [...campaign.injuries, { id: packEdit.uniqueId('new-injury', ids(campaign.injuries)), name: 'New injury', text: '' }] })}>Add an injury</button>
      </Group>
    </div>
  );
}
