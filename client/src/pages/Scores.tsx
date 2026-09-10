import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useTatamis } from '../lib/queries';
import { useArenaTerm } from '../lib/useArenaTerm';
import { useI18n } from '../i18n';

interface Medal { place: number; name: string; school: string }
interface CatResult { id: number; name: string; status: string; isSpecial: boolean; tatamiId: number | null; tatamiName: string | null; medals: Medal[] }
interface School { school: string; gold: number; silver: number; bronze: number }

export default function Scores() {
  const { t } = useI18n();
  const term = useArenaTerm();
  const { data: tatamis } = useTatamis();
  const { data } = useQuery<{ categories: CatResult[]; schools: School[] }>({ queryKey: ['results'], queryFn: () => api.get('/api/categories/results') });
  const cats = data?.categories ?? [];
  const schools = data?.schools ?? [];
  const nameOfPlace = (m: Medal[], p: number) => m.find((x) => x.place === p)?.name ?? '—';

  const groups = [
    { id: null as number | null, name: t('categories.unassigned') },
    ...(tatamis ?? []).map((tt) => ({ id: tt.id as number | null, name: tt.name })),
  ];
  const anyResults = cats.some((c) => c.medals.length > 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">{t('nav.scores')}</h1>

      {/* Medal tally by school/club */}
      {schools.length > 0 && (
        <div className="card overflow-hidden p-0">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">🏅 {t('scores.medalTable')}</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2 font-medium">#</th>
                <th className="px-4 py-2 font-medium">{t('fighters.school')}</th>
                <th className="px-3 py-2 text-center font-medium">🥇</th>
                <th className="px-3 py-2 text-center font-medium">🥈</th>
                <th className="px-3 py-2 text-center font-medium">🥉</th>
                <th className="px-3 py-2 text-center font-medium">{t('scores.total')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {schools.map((s, i) => (
                <tr key={s.school}>
                  <td className="px-4 py-2 font-semibold text-slate-400">{i + 1}</td>
                  <td className="px-4 py-2 font-medium text-slate-800">{s.school}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{s.gold || ''}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{s.silver || ''}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{s.bronze || ''}</td>
                  <td className="px-3 py-2 text-center font-bold tabular-nums">{s.gold + s.silver + s.bronze}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Per-arena results */}
      {groups.map((g) => {
        const list = cats.filter((c) => c.tatamiId === g.id && c.medals.length > 0);
        if (list.length === 0) return null;
        return (
          <div key={String(g.id)} className="space-y-2">
            <div className="text-sm font-semibold uppercase tracking-wide text-slate-400">{term}: {g.name}</div>
            <div className="card overflow-hidden p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2 font-medium">{t('scores.category')}</th>
                    <th className="px-4 py-2 font-medium">🥇 {t('scores.gold')}</th>
                    <th className="px-4 py-2 font-medium">🥈 {t('scores.silver')}</th>
                    <th className="px-4 py-2 font-medium">🥉 {t('scores.bronze')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {list.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-2 font-medium text-slate-800">{c.name}</td>
                      <td className="px-4 py-2">{nameOfPlace(c.medals, 1)}</td>
                      <td className="px-4 py-2 text-slate-600">{nameOfPlace(c.medals, 2)}</td>
                      <td className="px-4 py-2 text-slate-600">{nameOfPlace(c.medals, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {!anyResults && <div className="text-sm text-slate-400">{t('scores.none')}</div>}
    </div>
  );
}
