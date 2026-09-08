import { fighterMap, type BracketMatch, type BracketState } from '../lib/bracketTypes';
import { fightNumbers, orderedMatches } from '../lib/fightOrder';
import { displaySlotLabel } from '../lib/labels';
import { useI18n } from '../i18n';

/** Ordered "who fights next" list (top→bottom): rounds in order, bronze (3-4) before final (1-2). */
export default function UpNext({ state, title }: { state: BracketState; title?: string }) {
  const { t } = useI18n();
  const fmap = fighterMap(state);
  const R = Math.round(Math.log2(state.bracket.size));
  const nums = fightNumbers(state.bracket.matches);
  const upcoming = orderedMatches(state.bracket.matches).filter((m) => m.status === 'ready' || m.status === 'pending');
  const firstReadyId = upcoming.find((m) => m.status === 'ready')?.id;

  const name = (id: number | null) => {
    const f = id ? fmap.get(id) : undefined;
    return f ? `${f.firstName} ${f.lastName}` : null;
  };
  const side = (m: BracketMatch, s: 'a' | 'b') =>
    s === 'a'
      ? name(m.fighterAId) ?? displaySlotLabel(m.slotALabel, t) ?? '—'
      : name(m.fighterBId) ?? displaySlotLabel(m.slotBLabel, t) ?? '—';
  const roundLabel = (m: BracketMatch) => {
    if (m.isBronze) return t('bracket.bronze');
    if (m.isFinal) return t('bracket.final');
    if (m.round === R - 1) return t('bracket.sf');
    if (m.round === R - 2) return t('bracket.qf');
    return `${t('bracket.round')} ${m.round}`;
  };

  return (
    <div className="card p-4">
      <div className="mb-2 text-sm font-semibold text-slate-700">{title ?? t('upNext.title')}</div>
      {upcoming.length === 0 ? (
        <div className="text-sm text-slate-400">{t('upNext.allDone')}</div>
      ) : (
        <ol className="space-y-1.5">
          {upcoming.map((m) => {
            const isNow = m.id === firstReadyId;
            return (
              <li
                key={m.id}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                  isNow ? 'border border-emerald-300 bg-emerald-50' : 'bg-slate-50'
                }`}
              >
                <span className="badge bg-slate-800 text-white">#{nums.get(m.id)}</span>
                <span className="min-w-0 truncate font-medium text-slate-800">
                  {side(m, 'a')} <span className="text-slate-400">{t('bracket.vs')}</span> {side(m, 'b')}
                </span>
                {(m.isBronze || m.isFinal) && (
                  <span className={`badge ${m.isBronze ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-800'}`}>{roundLabel(m)}</span>
                )}
                <span
                  className={`badge ml-auto shrink-0 ${
                    isNow ? 'bg-emerald-600 text-white' : m.status === 'ready' ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {isNow ? t('upNext.now') : m.status === 'ready' ? t('upNext.ready') : t('upNext.waiting')}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
