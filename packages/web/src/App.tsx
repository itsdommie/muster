import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addUnit, addWarband, companyToList, countData, exportText, loadPack, markRecorded, newId, newList, restore, validateList,
  type AppData, type ArmyList, type Backup, type Campaign, type Collection, type PackDraft, type GameRecord, type PackIndex, type RestoreMode, type Tournament, type Unit,
} from '@muster/shared';
import sample from '../../../packs/sample.json';
import { AboutDialog } from './AboutDialog';
import { BackupDialog } from './BackupDialog';
import { saveTextFile } from './file';
import { ExportDialog, ImportDialog, PackDialog } from './Dialogs';
import { FightView } from './FightView';
import { GameView } from './GameView';
import { LibraryPanel } from './LibraryPanel';
import { ListPanel } from './ListPanel';
import { PrintSheet } from './PrintSheet';
import { RulesView } from './RulesView';
import { MoreView, moreSection, type MoreSection } from './MoreView';
import { useRoute, type View } from './route';
import { Welcome } from './Welcome';
import {
  clearCustomPack, loadCampaigns, loadCollections, loadDraft, loadCurrent, loadCustomPack, loadGames, loadLastBackup, loadLists, loadTournaments, loadWelcomeDismissed, saveWelcomeDismissed, saveCollections, saveCurrent, saveCustomPack, saveGames,
  saveCampaigns, saveDraft, saveLastBackup, saveLists, saveTournaments,
} from './storage';
import { SummaryPanel } from './SummaryPanel';
import { UnitCard } from './UnitCard';
import { UpdateBanner } from './UpdateBanner';
import { useUpdates } from './useUpdates';
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
  const [dialog, setDialog] = useState<'import' | 'pack' | 'export' | 'backup' | 'about' | null>(null);
  const updates = useUpdates();
  // The desktop Help menu opens About.
  useEffect(() => window.muster?.onMenu?.((action) => { if (action === 'about') setDialog('about'); }), []);
  const [lastBackup, setLastBackup] = useState<number | null>(loadLastBackup);
  const [welcomed, setWelcomed] = useState(loadWelcomeDismissed);
  const [copied, setCopied] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const copyTimer = useRef<number | undefined>(undefined);
  const [games, setGames] = useState<GameRecord[]>(loadGames);
  const [{ view, sub }, go] = useRoute();
  const setView = (v: View) => go(v);
  const [collections, setCollections] = useState<Record<string, Collection>>(loadCollections);
  const [tournaments, setTournaments] = useState<Tournament[]>(loadTournaments);
  const [campaigns, setCampaigns] = useState<Campaign[]>(loadCampaigns);
  const [recordGameId, setRecordGameId] = useState<string | null>(null);
  const [packDraft, setPackDraft] = useState<PackDraft | null>(loadDraft);
  useEffect(() => { saveDraft(packDraft); }, [packDraft]);
  const [gameScenario, setGameScenario] = useState<string | null>(null);
  const [lastMoreSub, setLastMoreSub] = useState<string | null>(null);
  useEffect(() => { if (view === 'more' && sub) setLastMoreSub(sub); }, [view, sub]);
  const [unitQuery, setUnitQuery] = useState('');
  const [unitSelected, setUnitSelected] = useState<string | null>(null);
  const [focusRule, setFocusRule] = useState<string | null>(null);

  const mine = useMemo(() => lists.filter((l) => l.pack === index.pack.id), [lists, index]);
  const list = mine.find((l) => l.id === currentId) ?? mine[0]!;
  const validation = useMemo(() => validateList(index, list), [index, list]);

  useEffect(() => {
    setSaveFailed(!(saveLists(lists) && saveCurrent(currentId) && saveGames(games) && saveCollections(collections) && saveTournaments(tournaments) && saveCampaigns(campaigns)));
  }, [lists, currentId, games, collections, tournaments, campaigns]);

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
    if (v === 'more') go('more', lastMoreSub);
    else setView(v);
  };
  // --- Backup and restore ---
  const snapshot = (): AppData => ({ lists, games, collections, tournaments, campaigns, customPack: loadCustomPack() ?? null });
  const hasData = games.length > 0 || tournaments.length > 0 || campaigns.length > 0 || lists.some((l) => l.warbands.length > 0) || countData(snapshot()).models > 0;
  const backupDue = hasData && (lastBackup === null || Date.now() - lastBackup > 30 * 24 * 3600 * 1000);

  /** Apply a backup to this device, and say what happened. */
  const applyRestore = (backup: Backup, mode: RestoreMode): string => {
    const before = snapshot();
    const merged = restore(before, backup.data, mode);
    let nextPack = { index, custom };
    let note = '';
    if (JSON.stringify(merged.customPack) !== JSON.stringify(before.customPack)) {
      if (merged.customPack === null) {
        clearCustomPack();
        nextPack = samplePack();
      } else {
        const r = loadPack(merged.customPack);
        if (r.ok) {
          saveCustomPack(merged.customPack);
          nextPack = { index: r.index, custom: true };
          note = ` Now using the data pack "${r.index.pack.name}".`;
        } else note = ' The backup\'s data pack could not be read, so the current one was kept.';
      }
    }
    // Whatever pack is now active needs a list to show.
    let nextLists = merged.lists;
    let active = nextLists.find((l) => l.id === currentId && l.pack === nextPack.index.pack.id) ?? nextLists.find((l) => l.pack === nextPack.index.pack.id);
    if (!active) {
      active = newList(nextPack.index);
      nextLists = [...nextLists, active];
    }
    setLists(nextLists);
    setGames(merged.games);
    setCollections(merged.collections);
    setTournaments(merged.tournaments);
    setCampaigns(merged.campaigns);
    setCurrentId(active.id);
    if (nextPack.index !== index) setPack(nextPack);
    setSelected(null);
    setUnitSelected(null);
    setFocusRule(null);
    const c = countData(merged);
    return `Restored. This device now has ${c.lists} list${c.lists === 1 ? '' : 's'}, ${c.games} game${c.games === 1 ? '' : 's'}, ${c.tournaments} tournament${c.tournaments === 1 ? '' : 's'}, ${c.campaigns} campaign${c.campaigns === 1 ? '' : 's'} and ${c.models} model${c.models === 1 ? '' : 's'} in the collection.${note}`;
  };

  // --- Campaigns ---
  const myCampaigns = campaigns.filter((c) => c.pack === index.pack.id);
  const campaignNames = Object.fromEntries(campaigns.map((c) => [c.id, c.name]));
  const waitingGames = games.filter((g) => g.campaign && g.finishedAt && !g.campaignRecorded);

  /** Turn a company into a list. A company has one list that is refreshed each time, so the list menu does not fill up with copies. */
  const makeCompanyList = (c: Campaign, includeInjured: boolean) => {
    const { list: fresh, notes } = companyToList(index, c, { includeInjured });
    const existing = lists.find((l) => l.campaign === c.id && l.pack === index.pack.id);
    const made: ArmyList = existing ? { ...fresh, id: existing.id, name: existing.name } : fresh;
    setLists((all) => (existing ? all.map((l) => (l.id === existing.id ? made : l)) : [...all, made]));
    setCurrentId(made.id);
    setSelected(null);
    const models = made.warbands.reduce((n, w) => n + (w.leader ? 1 : 0) + w.members.reduce((m, e) => m + e.count, 0), 0);
    // A company grows by its own rules and may not fit the usual list-building limits (bows, warband sizes…). Say so, and let them decide.
    const check = validateList(index, made);
    const problems = check.issues.filter((i) => i.severity === 'error').map((i) => i.message);
    const extra = problems.length > 0 ? [`Under the usual list-building rules this has ${problems.length} problem${problems.length === 1 ? '' : 's'}: ${problems.join(' ')}`] : [];
    return { name: made.name, models, points: check.summary.points, notes: [...notes, ...extra] };
  };
  const recordInCampaign = (gameId: string) => {
    setRecordGameId(gameId);
    go('more', 'campaign');
  };

  const collection = collections[index.pack.id] ?? {};
  const editCollection = (fn: (c: Collection) => Collection) => setCollections((all) => ({ ...all, [index.pack.id]: fn(all[index.pack.id] ?? {}) }));
  const playScenario = (id: string) => {
    setGameScenario(id);
    go('game');
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
  const canShare = typeof window.muster?.shareText === 'function';
  const download = () => {
    // A phone's web view cannot save files, so there the list goes through the share sheet instead.
    if (window.muster?.shareText) {
      void window.muster.shareText(list.name, text());
      return;
    }
    void saveTextFile(`${list.name.replace(/[^\w-]+/g, '_') || 'list'}.txt`, 'text/plain', text());
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
  /** Use a pack written in the editor. Saved lists stay as they are: those that no longer fit show their errors in the Builder. */
  const applyPack = (draft: PackDraft): string[] | null => {
    const r = loadPack(draft);
    if (!r.ok) return r.errors;
    saveCustomPack(r.index.pack);
    if (r.index.pack.id === index.pack.id) {
      setPack({ index: r.index, custom: true });
      setSelected(null);
      setUnitSelected(null);
    } else switchPack({ index: r.index, custom: true });
    return null;
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
      <UpdateBanner updates={updates} />
      <header className="topbar">
        <h1><span aria-hidden>★</span> Muster</h1>
        <nav className="views" aria-label="Views">
          {([['builder', 'Builder'], ['units', 'Units'], ['rules', 'Rules'], ['fight', 'Fight'], ['game', 'Game'], ['more', 'More']] as const).map(([v, label]) => (
            <button key={v} className={view === v ? 'on' : ''} aria-current={view === v ? 'page' : undefined} onClick={() => goTo(v)}>
              {label}{v === 'game' && games.some((g) => !g.finishedAt) && <span className="live" role="img" aria-label="game in progress" />}
            </button>
          ))}
        </nav>
        <div className="topbar-actions">
          <button className="pack-btn" onClick={() => setDialog('pack')} title="Data pack">
            {index.pack.name}
          </button>
          <button onClick={() => setDialog('backup')} title="Save a backup, or restore one">
            Backup{backupDue && <span className="due" role="img" aria-label="backup due" />}
          </button>
        </div>
      </header>
      {saveFailed && <p className="banner">Browser storage is unavailable, so changes will be lost when you close the app. Use “Copy as text” to keep a list.</p>}

      <div className="view" hidden={view !== 'builder'}>
        {!custom && !welcomed && (
          <Welcome
            onWrite={() => go('more', 'pack')}
            onLoad={() => setDialog('pack')}
            onDismiss={() => { saveWelcomeDismissed(); setWelcomed(true); }}
          />
        )}
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
          <SummaryPanel validation={validation} onCopy={copy} onDownload={download} onPrint={print} copied={copied} canShare={canShare} />
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
          index={index} lists={mine} games={games} onGames={setGames} scenarioId={gameScenario} campaignNames={campaignNames} onRecordInCampaign={recordInCampaign}
          onInspect={(unitId) => { const u = index.units.get(unitId); if (u) setInspect(u); }}
        />
      </div>

      <div className="view" hidden={view !== 'more'}>
        <MoreView
          index={index} section={moreSection(sub)} onSection={(s: MoreSection) => go('more', s)}
          collection={collection} onCollection={editCollection} lists={mine} currentListId={list.id}
          tournaments={tournaments} onTournaments={setTournaments} onPlayScenario={playScenario}
          campaigns={myCampaigns}
          onCampaigns={(fn) => setCampaigns((all) => {
            // The view edits only this pack's campaigns; keep everyone else's untouched.
            const mine = fn(all.filter((c) => c.pack === index.pack.id));
            return [...all.filter((c) => c.pack !== index.pack.id), ...mine];
          })}
          waitingGames={waitingGames} onGameRecorded={(id) => setGames((all) => all.map((g) => (g.id === id ? markRecorded(g) : g)))}
          onMakeCompanyList={makeCompanyList} onOpenBuilder={() => go('builder')}
          recordGameId={recordGameId} onRecordHandled={() => setRecordGameId(null)}
          customPackInUse={custom} packDraft={packDraft} onPackDraft={setPackDraft} allLists={lists} onApplyPack={applyPack}
        />
      </div>

      <footer className="foot">
        Unofficial fan project. Not affiliated with or endorsed by Games Workshop or any rights holder. Muster ships no game data.
        {' '}<button className="link" onClick={() => setDialog('about')}>About</button>
      </footer>

      {inspect && <UnitCard index={index} unit={inspect} onClose={() => setInspect(null)} onRule={openRule} />}
      {dialog === 'import' && <ImportDialog index={index} onImport={createList} onClose={() => setDialog(null)} />}
      {dialog === 'export' && <ExportDialog text={text()} onClose={() => setDialog(null)} />}
      {dialog === 'about' && <AboutDialog updates={updates} onClose={() => setDialog(null)} />}
      {dialog === 'backup' && (
        <BackupDialog
          data={snapshot()} lastBackup={lastBackup} onClose={() => setDialog(null)}
          onBackedUp={(at) => { setLastBackup(at); saveLastBackup(at); }} onRestore={applyRestore}
        />
      )}
      {dialog === 'pack' && <PackDialog index={index} custom={custom} onLoad={loadCustom} onReset={resetPack} onEdit={() => go('more', 'pack')} onClose={() => setDialog(null)} />}
      <PrintSheet index={index} list={list} validation={validation} />
    </div>
  );
}
