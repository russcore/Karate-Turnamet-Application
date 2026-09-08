import RankChip from './RankChip';
import BoutTimer from './BoutTimer';
import { useI18n } from '../i18n';
import { displaySlotLabel } from '../lib/labels';
import { useEvent } from '../lib/queries';
import type { BracketFighter, BracketMatch } from '../lib/bracketTypes';

interface Props {
  match: BracketMatch;
  fighters: Map<number, BracketFighter>;
  tatamiName?: string;
  tatamiImage?: string | null;
  categoryName?: string;
  editable?: boolean;
  order?: number; // bout number in fight order
  isCurrent?: boolean; // the one bout that runs now on this tatami (others wait)
  boutDurationSec?: number;
  onPickWinner?: (winnerId: number) => void;
  onRevert?: () => void;
  onTimeUp?: (label: string) => void;
  onReorder?: (direction: 'now' | 'later') => void;
}

function fighterLabel(f?: BracketFighter): string {
  return f ? `${f.firstName} ${f.lastName}` : '';
}

export default function MatchCard({ match, fighters, tatamiName, tatamiImage, categoryName, editable, order, isCurrent, boutDurationSec, onPickWinner, onRevert, onTimeUp, onReorder }: Props) {
  const { t } = useI18n();
  const { data: event } = useEvent();
  const cornerA = { name: event?.cornerAName ?? 'AO', color: event?.cornerAColor ?? '#2563eb' };
  const cornerB = { name: event?.cornerBName ?? 'AKA', color: event?.cornerBColor ?? '#dc2626' };
  const a = match.fighterAId ? fighters.get(match.fighterAId) : undefined;
  const b = match.fighterBId ? fighters.get(match.fighterBId) : undefined;
  const decided = match.status === 'done' || match.status === 'bye';
  // Only one bout runs at a time on a tatami. A ready bout that isn't the current one waits (greyed);
  // a pending bout (SF/Bronze/Final) is greyed until both its fighters are known.
  const waiting = match.status === 'ready' && !isCurrent;
  const awaiting = match.status === 'pending';
  const dimmed = waiting || awaiting;
  const boutLabel = `${fighterLabel(a) || '?'} ${t('bracket.vs')} ${fighterLabel(b) || '?'}`;

  const Slot = ({ f, slotLabel, fid, corner }: { f?: BracketFighter; slotLabel: string | null; fid: number | null; corner: { name: string; color: string } }) => {
    const isWinner = decided && match.winnerId === fid;
    const isLoser = decided && match.loserId === fid && fid != null;
    // A finished fight is locked, and only the CURRENT ready bout accepts a winner. To change a
    // decided result you must Revert first; a waiting bout is greyed until the current one ends.
    const clickable = editable && !!fid && match.status === 'ready' && isCurrent;
    return (
      <button
        type="button"
        disabled={!clickable}
        onClick={() => fid && onPickWinner?.(fid)}
        style={{ borderLeft: `4px solid ${corner.color}` }}
        className={[
          'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition',
          isWinner ? 'border-emerald-500 bg-emerald-50' : '',
          isLoser ? 'border-red-400 bg-red-50 opacity-60' : '',
          !isWinner && !isLoser && f ? 'border-slate-200 bg-white' : '',
          !isWinner && !isLoser && !f ? 'border-dashed border-slate-300 bg-slate-50/60' : '',
          clickable ? 'hover:border-slate-400 cursor-pointer' : 'cursor-default',
        ].join(' ')}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 truncate text-sm font-semibold text-slate-900">
            <span className="shrink-0 rounded px-1 py-0.5 text-[10px] font-bold text-white" style={{ background: corner.color }}>{corner.name}</span>
            {f ? fighterLabel(f) : <span className="text-slate-400">{displaySlotLabel(slotLabel, t) || '—'}</span>}
          </div>
          {f && (
            <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
              {f.school && <span className="truncate">{f.school}</span>}
              <RankChip name={f.rank?.name} color={f.rank?.beltColor} stripeColor={f.rank?.stripeColor} stripeCount={f.rank?.stripeCount} />
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {f && <span className="text-xs font-medium text-slate-500">{f.weight}kg</span>}
          {isWinner && <span className="text-emerald-600">→</span>}
        </div>
      </button>
    );
  };

  return (
    <div className={[
      'card relative w-72 p-3 transition',
      isCurrent && match.status === 'ready' ? 'ring-2 ring-emerald-500 ring-offset-1' : '',
      dimmed ? 'opacity-50 grayscale' : '',
    ].join(' ')}>
      <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-400">
        <span className="flex items-center gap-1.5">
          {order != null && match.status !== 'bye' && (
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-white">#{order}</span>
          )}
          {isCurrent && match.status === 'ready' && (
            <span className="rounded bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{t('bracket.now')}</span>
          )}
          {waiting && (
            <span className="rounded bg-slate-300 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{t('bracket.waiting')}</span>
          )}
          {awaiting && (
            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{t('bracket.awaiting')}</span>
          )}
          {match.isBronze ? t('bracket.bronze') : match.isFinal ? t('bracket.final') : `${tatamiName ?? ''}`}
        </span>
        <span className="truncate">{categoryName}</span>
      </div>

      {/* Who vs who, at the top in large text. */}
      <div className="mb-2 text-center text-base font-bold leading-tight text-slate-800">
        {fighterLabel(a) || '?'} <span className="text-slate-400">{t('bracket.vs')}</span> {fighterLabel(b) || '?'}
      </div>

      <div className="space-y-1.5">
        <Slot f={a} slotLabel={match.slotALabel} fid={match.fighterAId} corner={cornerA} />
        <Slot f={b} slotLabel={match.slotBLabel} fid={match.fighterBId} corner={cornerB} />
      </div>

      {/* Tatami illustration under the P1/P2 box (falls back to the bundled default). */}
      <div className="mt-3 overflow-hidden rounded-lg bg-slate-100">
        <img src={tatamiImage || '/default-tatami.svg'} alt="tatami" className="h-20 w-full object-cover" />
      </div>

      {editable && boutDurationSec != null && match.status === 'ready' && isCurrent && (
        <BoutTimer compact durationSec={boutDurationSec} onFinish={() => onTimeUp?.(boutLabel)} />
      )}

      {/* Reorder within the round: postpone the current bout (late fighter) or bring one forward. */}
      {editable && onReorder && match.status === 'ready' && (
        isCurrent ? (
          <button className="btn-ghost mt-2 w-full py-1 text-xs" onClick={() => onReorder('later')} title={t('bracket.postponeHint')}>
            ⏭ {t('bracket.postpone')}
          </button>
        ) : (
          <button className="btn-ghost mt-2 w-full py-1 text-xs font-semibold text-emerald-600" onClick={() => onReorder('now')} title={t('bracket.fightNowHint')}>
            ▶ {t('bracket.fightNow')}
          </button>
        )
      )}

      {/* Decided result: show HOW the winner won (decision + score). The result is locked. */}
      {match.status === 'done' && match.decision && (() => {
        const winnerIsA = match.winnerId === match.fighterAId;
        const ws = winnerIsA ? match.scoreA : match.scoreB;
        const ls = winnerIsA ? match.scoreB : match.scoreA;
        const hasScore = ws != null || ls != null;
        return (
          <div className="mt-2 rounded-lg bg-emerald-50 px-2 py-1.5 text-center text-xs">
            <span className="font-semibold text-emerald-700">🏆 {t('decision.' + match.decision)}</span>
            {hasScore && <span className="ml-1 font-medium text-emerald-600">· {ws ?? 0}:{ls ?? 0}</span>}
          </div>
        );
      })()}

      {editable && decided && onRevert && (
        <button className="btn-ghost mt-2 w-full py-1 text-xs" onClick={onRevert} title={t('bracket.revertToChange')}>
          🔒 {t('bracket.revertToChange')}
        </button>
      )}
      {match.status === 'bye' && (
        <div className="mt-1 text-center text-[11px] font-medium uppercase text-amber-600">{t('bracket.bye')}</div>
      )}
    </div>
  );
}
