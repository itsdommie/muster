import type { ArmyList, Campaign, Collection, GameRecord, PackIndex, Tournament } from '@muster/shared';
import { CampaignView } from './CampaignView';
import { CollectionView } from './CollectionView';
import { ScenariosView } from './ScenariosView';
import { TournamentView } from './TournamentView';

export const MORE_SECTIONS = [['collection', 'Collection'], ['campaign', 'Campaign'], ['scenarios', 'Scenarios'], ['tournament', 'Tournament']] as const;
export type MoreSection = (typeof MORE_SECTIONS)[number][0];

export const moreSection = (sub: string | null): MoreSection => MORE_SECTIONS.find(([id]) => id === sub)?.[0] ?? 'collection';

interface Props {
  index: PackIndex;
  section: MoreSection;
  onSection: (s: MoreSection) => void;
  collection: Collection;
  onCollection: (fn: (c: Collection) => Collection) => void;
  lists: ArmyList[];
  currentListId: string;
  tournaments: Tournament[];
  onTournaments: (fn: (all: Tournament[]) => Tournament[]) => void;
  onPlayScenario: (id: string) => void;
  campaigns: Campaign[];
  onCampaigns: (fn: (all: Campaign[]) => Campaign[]) => void;
  waitingGames: GameRecord[];
  onGameRecorded: (gameId: string) => void;
  onMakeCompanyList: (c: Campaign, includeInjured: boolean) => { name: string; models: number; points: number; notes: string[] };
  onOpenBuilder: () => void;
  recordGameId: string | null;
  onRecordHandled: () => void;
}

export function MoreView(p: Props) {
  return (
    <div className="more">
      <nav className="subnav segmented" aria-label="More sections">
        {MORE_SECTIONS.map(([id, label]) => (
          <button key={id} className={p.section === id ? 'on' : ''} aria-current={p.section === id ? 'page' : undefined} onClick={() => p.onSection(id)}>{label}</button>
        ))}
      </nav>
      {p.section === 'collection' && <CollectionView index={p.index} collection={p.collection} onCollection={p.onCollection} lists={p.lists} currentListId={p.currentListId} />}
      {p.section === 'campaign' && (
        <CampaignView
          index={p.index} campaigns={p.campaigns} onCampaigns={p.onCampaigns} waiting={p.waitingGames} onGameRecorded={p.onGameRecorded}
          onMakeList={p.onMakeCompanyList} onOpenBuilder={p.onOpenBuilder} recordGameId={p.recordGameId} onRecordHandled={p.onRecordHandled}
        />
      )}
      {p.section === 'scenarios' && <ScenariosView index={p.index} onPlay={p.onPlayScenario} />}
      {p.section === 'tournament' && <TournamentView tournaments={p.tournaments} onTournaments={p.onTournaments} />}
    </div>
  );
}
