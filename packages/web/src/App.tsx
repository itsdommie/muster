import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addUnit, addWarband, exportText, loadPack, newId, newList, validateList,
  type ArmyList, type GameRecord, type PackIndex, type Unit,
} from '@muster/shared';
import sample from '../../../packs/sample.json';
import { ExportDialog, ImportDialog, PackDialog } from './Dialogs';
import { FightView } from './FightView';
import { GameView } from './GameView';
import { LibraryPanel } from './LibraryPanel';
import { ListPanel } from './ListPanel';
import { PrintSheet } from './PrintSheet';
import { RulesView } from './RulesView';
import { useView, type View } from './route';
import { clearCustomPack, loadCurrent, loadCustomPack, loadGames, loadLists, saveCurrent, saveCustomPack, saveGames, saveLists } from './storage';
import { SummaryPanel } from './SummaryPanel';
import { UnitCard } from './UnitCard';
import { UnitsView } from './UnitsView';

function samplePack(): { index: PackIndex; custom: boolean } {
  const r = loadPack(sample);
  if (!r.ok) throw new Error(`Bundled sample pack is invalid:\n${r.errors.join('\n')}`);
  return { index: r.index, custom: false };
}

function initialIndex(): { index: PackIndex; custom: boolean } {
  const stored = loadCustomPack();
  if (stored) {
    const r = loadPack(stored);
    if (r.ok) return { index: r.index, custom: true };
  }
  return samplePack();
}

type Tab = 'units' | 'list' | 'summary';

export function App() {
  const [{ index, custom }, setPack] = useState(initialIndex);
  // All saved lists, across packs. Only those built with the active pack are shown (see `mine`).
  const [lists, setLists] = useState<ArmyList[]>(() => {
    const saved = loadLists();
    return saved.some((l) => l.pack === index.pack.id) ? saved : [...saved, newList(index)];
  });
  const [currentId, setCurrentId] = useState<string>(() => {
    const saved = loadCurrent();
    const mine = lists.filter((l) => l.pack === index.pack.id);
    return mine.find((l) => l.id === saved)?.id ?? mine[0]!.id;
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('list');
  const [inspect, setInspect] = useState<Unit | null>(null);
  const [dialog, setDialog] = useState<'import' | 'pack' | 'export' | null>(null);
  const [copied, setCopied] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const copyTimer = useRef<number | undefined>(undefined);
  const [games, setGames] = useState<GameRecord[]>(loadGames);
  const [view, setView] = useView();
  const [unitQuery, setUnitQuery] = useState('');
  const [unitSelected, setUnitSelected] = useState<string | null>(null);
  const [focusRule, setFocusRule] = useState<string | null>(null);

  const mine = useMemo(() => lists.filter((l) => l.pack === index.pack.id), [lists, index]);
  const list = mine.find((l) => l.id === currentId) ?? mine[0]!;
  const validation = useMemo(() => validateList(index, list), [index, list]);

  useEffect(() => {
    setSaveFailed(!(saveLists(lists) && saveCurrent(currentId) && saveGames(games)));
  }, [lists, currentId, games]);

  const change = useCallback(
    (fn: (l: ArmyList) => ArmyList) => setLists((all) => all.map((l) => (l.id === currentId ? fn(l) : l))),
    [currentId],
  );

  const selectedWarband = list.warbands.find((w) => w.id === selected) ?? null;
  const browseArmy = selectedWarband?.army ?? list.army;

  const onAdd = (unit: Unit) => {
    const target = selectedWarband ?? list.warbands.at(-1);
    if (!target) return;
    setSelected(target.id);
    change((l) => addUnit(l, target.id, unit));
  };

  const onAddWarband = (army: string) => {
    const next = addWarband(list, army);
    setSelected(next.warbands.at(-1)!.id);
    change(() => next);
  };

  const createList = (l: ArmyList = newList(index, list.army, list.limit)) => {
    setLists((all) => [...all, l]);
    setCurrentId(l.id);
    setSelected(null);
    setTab('list');
  };

  const deleteList = () => {
    if (!window.confirm(`Delete "${list.name}"?`)) return;
    const rest = lists.filter((l) => l.id !== list.id);
    const fallback = rest.find((l) => l.pack === index.pack.id) ?? newList(index);
    setLists(rest.includes(fallback) ? rest : [...rest, fallback]);
    setCurrentId(fallback.id);
    setSelected(null);
  };

  const duplicateList = () => createList({ ...structuredClone(list), id: newId(), name: `${list.name} (copy)`, updated: Date.now() });

  // Cross-links between the views: a rule name opens the reference, a unit name opens the database.
  const openRule = (ruleId: string) => {
    setInspect(null);
    setUnitSelected(null);
    setFocusRule(ruleId);
    setView('rules');
  };
  const openUnit = (unitId: string) => {
    setUnitSelected(unitId);
    setView('units');
  };
  const goTo = (v: View) => {
    if (v !== 'rules') setFocusRule(null);
    setView(v);
  };

  const text = () => exportText(index, list);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text());
      setCopied(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setDialog('export'); // clipboard unavailable: show the text to copy by hand
    }
  };
  /** The desktop app saves a real PDF; browsers and phones use the print dialog (which can also save as PDF). */
  const print = () => {
    if (window.muster) void window.muster.savePdf(list.name);
    else window.print();
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text()], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${list.name.replace(/[^\w-]+/g, '_') || 'list'}.txt` });
    a.click();
    URL.revokeObjectURL(url);
  };

  /** Make `next` the active pack, landing on one of its lists (creating one the first time). */
  const switchPack = (next: { index: PackIndex; custom: boolean }) => {
    const existing = lists.find((l) => l.pack === next.index.pack.id);
    const target = existing ?? newList(next.index);
    if (!existing) setLists((all) => [...all, target]);
    setCurrentId(target.id);
    setPack(next);
    setSelected(null);
    setUnitSelected(null);
    setFocusRule(null);
  };
  const loadCustom = (json: unknown): string[] | null => {
    const r = loadPack(json);
    if (!r.ok) return r.errors;
    saveCustomPack(json);
    switchPack({ index: r.index, custom: true });
    return null;
  };
  const resetPack = () => {
    clearCustomPack();
    switchPack(samplePack());
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1><span aria-hidden>★</span> Muster</h1>
        <nav className="views" aria-label="Views">
          {([['builder', 'Builder'], ['units', 'Units'], ['rules', 'Rules'], ['fight', 'Fight'], ['game', 'Game']] as const).map(([v, label]) => (
            <button key={v} className={view === v ? 'on' : ''} aria-current={view === v ? 'page' : undefined} onClick={() => goTo(v)}>
              {label}{v === 'game' && games.some((g) => !g.finishedAt) && <span className="live" role="img" aria-label="game in progress" />}
            </button>
          ))}
        </nav>
        <button className="pack-btn" onClick={() => setDialog('pack')} title="Data pack">
          {index.pack.name}
        </button>
      </header>
      {saveFailed && <p className="banner">Browser storage is unavailable, so changes will be lost when you close the app. Use “Download .txt” to keep a list.</p>}

      <div className="view" hidden={view !== 'builder'}>
        <div className="list-picker">
          <select value={list.id} onChange={(e) => { setCurrentId(e.target.value); setSelected(null); }} aria-label="Saved lists">
            {mine.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <button onClick={() => createList()}>New</button>
          <button onClick={duplicateList}>Duplicate</button>
          <button onClick={() => setDialog('import')}>Import</button>
          <button onClick={deleteList}>Delete</button>
        </div>

        <nav className="tabs" aria-label="Sections">
          {(['units', 'list', 'summary'] as const).map((t) => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'units' ? 'Add' : t === 'list' ? 'List' : 'Summary'}</button>
          ))}
        </nav>

        <main className={`layout tab-${tab}`}>
          <LibraryPanel index={index} armyId={browseArmy} canAdd={list.warbands.length > 0} onAdd={onAdd} onInspect={setInspect} />
          <ListPanel
            index={index} list={list} issues={validation.issues} selected={selectedWarband?.id ?? null}
            onSelect={setSelected} onChange={change} onInspect={setInspect} onAddWarband={onAddWarband}
          />
          <SummaryPanel validation={validation} onCopy={copy} onDownload={download} onPrint={print} copied={copied} />
        </main>
      </div>

      <div className="view" hidden={view !== 'units'}>
        <UnitsView index={index} query={unitQuery} onQuery={setUnitQuery} selected={unitSelected} onSelect={setUnitSelected} onRule={openRule} />
      </div>

      <div className="view" hidden={view !== 'rules'}>
        <RulesView index={index} focusRule={focusRule} onUnit={openUnit} />
      </div>

      <div className="view" hidden={view !== 'fight'}>
        <FightView key={index.pack.id} index={index} />
      </div>

      <div className="view" hidden={view !== 'game'}>
        <GameView
          index={index} lists={mine} games={games} onGames={setGames}
          onInspect={(unitId) => { const u = index.units.get(unitId); if (u) setInspect(u); }}
        />
      </div>

      <footer className="foot">
        Unofficial fan project. Not affiliated with or endorsed by Games Workshop or any rights holder. Muster ships no game data.
      </footer>

      {inspect && <UnitCard index={index} unit={inspect} onClose={() => setInspect(null)} onRule={openRule} />}
      {dialog === 'import' && <ImportDialog index={index} onImport={createList} onClose={() => setDialog(null)} />}
      {dialog === 'export' && <ExportDialog text={text()} onClose={() => setDialog(null)} />}
      {dialog === 'pack' && <PackDialog index={index} custom={custom} onLoad={loadCustom} onReset={resetPack} onClose={() => setDialog(null)} />}
      <PrintSheet index={index} list={list} validation={validation} />
    </div>
  );
}
