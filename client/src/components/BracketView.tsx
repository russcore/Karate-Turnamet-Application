import MatchCard from './MatchCard';
import UpNext from './UpNext';
import { useI18n } from '../i18n';
import { fighterMap, type BracketState } from '../lib/bracketTypes';
import { fightNumbers, orderedMatches } from '../lib/fightOrder';

interface Props {
  state: BracketState;
  editable?: boolean;
  tatamiName?: string;
  tatamiImage?: string | null;
  categoryName?: string;
  showUpNext?: boolean;
  boutDurationSec?: number;
  onPickWinner?: (matchId: number, winnerId: number, version: number, fighterAId: number | null) => void;
  onRevert?: (matchId: number) => void;
  onTimeUp?: (label: string) => void;
  onReorder?: (matchId: number, direction: 'now' | 'later') => void;
}

const roundName = (r: number, R: number): string => {
  if (r === R - 1) return 'Semifinals';
  if (r === R - 2) return 'Quarterfinals';
  return `Round ${r}`;
};

export default function BracketView({ state, editable, tatamiName, tatamiImage, categoryName, showUpNext = true, boutDurationSec, onPickWinner, onRevert, onTimeUp, onReorder }: Props) {
  const { t } = useI18n();
  const fmap = fighterMap(state);
  const size = state.bracket.size;
  const R = Math.round(Math.log2(size));
  const nums = fightNumbers(state.bracket.matches);
  // Only ONE fight runs on a tatami at a time: the next ready bout in fight order is "current";
  // every other ready bout is greyed out and waits until it finishes.
  const currentMatchId = orderedMatches(state.bracket.matches).find(
    (m) => m.status === 'ready' && m.fighterAId != null && m.fighterBId != null && m.winnerId == null,
  )?.id ?? null;
  const bronze = state.bracket.matches.find((m) => m.isBronze);
  const final = state.bracket.matches.find((m) => m.isFinal);
  const medalColor = ['', 'bg-amber-100 text-amber-800', 'bg-slate-200 text-slate-700', 'bg-orange-100 text-orange-800', 'bg-orange-50 text-orange-700'];

  const card = (m: (typeof state.bracket.matches)[number]) => (
    <MatchCard
      key={m.id}
      match={m}
      fighters={fmap}
      order={nums.get(m.id)}
      tatamiName={tatamiName}
      tatamiImage={tatamiImage}
      categoryName={categoryName}
      editable={editable}
      isCurrent={m.id === currentMatchId}
      boutDurationSec={boutDurationSec}
      onPickWinner={(wid) => onPickWinner?.(m.id, wid, m.version, m.fighterAId)}
      onRevert={() => onRevert?.(m.id)}
      onTimeUp={onTimeUp}
      onReorder={(dir) => onReorder?.(m.id, dir)}
    />
  );

  // Earlier rounds (QF, SF, …) — everything except the final round column.
  const earlyRounds = Array.from({ length: Math.max(0, R - 1) }, (_, i) => i + 1);

  return (
    <div className="space-y-6">
      {showUpNext && <UpNext state={state} />}

      {/* p-1 gives the current bout's green ring room so it isn't clipped by overflow. */}
      <div className="flex gap-8 overflow-x-auto p-1 pb-4">
        {earlyRounds.map((r) => {
          const matches = state.bracket.matches
            .filter((m) => m.round === r && !m.isBronze)
            .sort((a, b) => a.position - b.position);
          return (
            <div key={r} className="flex flex-col justify-around gap-6">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{roundName(r, R)}</div>
              {matches.map(card)}
            </div>
          );
        })}

        {/* Bronze (3rd/4th) column — always shown BEFORE the final. */}
        {bronze && (
          <div className="flex flex-col justify-center gap-6">
            <div className="text-xs font-semibold uppercase tracking-wide text-orange-500">{t('bracket.bronze')}</div>
            {card(bronze)}
          </div>
        )}

        {/* Final (1st/2nd) column — last. */}
        {final && (
          <div className="flex flex-col justify-center gap-6">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-500">{t('bracket.final')}</div>
            {card(final)}
          </div>
        )}
      </div>

      {state.placements.length > 0 && (
        <div className="card p-4">
          <div className="mb-2 text-sm font-semibold text-slate-700">{t('bracket.place')}s</div>
          <div className="flex flex-wrap gap-3">
            {state.placements
              .sort((a, b) => a.place - b.place)
              .map((p) => {
                const f = fmap.get(p.fighterId);
                return (
                  <div key={p.place} className={`badge ${medalColor[p.place] || 'bg-slate-100'} px-3 py-1 text-sm`}>
                    <span className="mr-2 font-bold">#{p.place}</span>
                    {f ? `${f.firstName} ${f.lastName}` : p.fighterId}
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
