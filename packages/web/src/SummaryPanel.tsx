import type { Validation } from '@muster/shared';

interface Props {
  validation: Validation;
  onCopy: () => void;
  onDownload: () => void;
  onPrint: () => void;
  copied: boolean;
}

export function SummaryPanel({ validation, onCopy, onDownload, onPrint, copied }: Props) {
  const { summary: s, issues, valid } = validation;
  const pct = s.limit > 0 ? Math.min(100, (s.points / s.limit) * 100) : 0;
  const listLevel = issues.filter((i) => !i.warband);
  const errorCount = issues.filter((i) => i.severity === 'error').length;

  return (
    <div className="panel summary">
      <div className="panel-head">
        <h2>Summary</h2>
        <div className={`meter${s.points > s.limit ? ' over' : ''}`} role="img" aria-label={`${s.points} of ${s.limit} points`}>
          <div style={{ width: `${pct}%` }} />
        </div>
        <p className="points">
          <strong>{s.points}</strong> / {s.limit} pts
        </p>
        <p className={`status ${valid ? 'ok' : 'bad'}`} role="status">{valid ? 'Legal list' : `${errorCount} problem${errorCount === 1 ? '' : 's'}`}</p>
      </div>
      <dl className="facts">
        <div><dt>Models</dt><dd>{s.models}</dd></div>
        <div><dt>Warbands</dt><dd>{s.warbands}</dd></div>
        <div><dt>Heroes</dt><dd>{s.heroes}</dd></div>
        <div><dt>Broken at</dt><dd>{s.models ? `${s.breakAt} lost` : '-'}</dd></div>
        <div><dt>Bows / throwing</dt><dd className={s.bowModels > s.bowAllowed ? 'bad' : ''}>{s.bowModels} / {s.bowAllowed}</dd></div>
        {s.alliedPoints > 0 && <div><dt>Allied points</dt><dd>{s.alliedPoints}</dd></div>}
      </dl>
      {listLevel.length > 0 && (
        <div className="issues">
          {listLevel.map((x, i) => <p key={i} className={`issue ${x.severity}`}>{x.message}</p>)}
        </div>
      )}
      <div className="actions">
        <button onClick={onCopy}>{copied ? 'Copied' : 'Copy as text'}</button>
        <button onClick={onDownload}>Download .txt</button>
        <button onClick={onPrint}>Print / PDF</button>
      </div>
    </div>
  );
}
