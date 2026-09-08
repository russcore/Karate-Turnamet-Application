import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useTatamis } from '../lib/queries';
import { useI18n } from '../i18n';

export default function Dashboard() {
  const { t } = useI18n();
  const { data: tatamis } = useTatamis();
  const { data: fighterCount } = useQuery({ queryKey: ['fighters', 'count'], queryFn: () => api.get('/api/fighters/count') });
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => api.get('/api/categories') });

  const cats = (categories as any[]) ?? [];
  const perTatami = (tatamis ?? []).map((tt) => {
    const own = cats.filter((c) => c.tatamiId === tt.id);
    const done = own.filter((c) => c.status === 'done').length;
    return { tatami: tt, total: own.length, done };
  });

  const Stat = ({ label, value }: { label: string; value: number | string }) => (
    <div className="card p-5">
      <div className="text-3xl font-bold text-slate-900">{value}</div>
      <div className="mt-1 text-sm text-slate-500">{label}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">{t('dashboard.title')}</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Stat label={t('dashboard.fighters')} value={fighterCount?.count ?? 0} />
        <Stat label={t('dashboard.categories')} value={cats.length} />
        <Stat label={t('dashboard.tatamis')} value={tatamis?.length ?? 0} />
      </div>

      <div className="card p-5">
        <div className="mb-3 text-sm font-semibold text-slate-700">{t('dashboard.progress')}</div>
        <div className="space-y-3">
          {perTatami.map(({ tatami, total, done }) => (
            <div key={tatami.id}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="font-medium text-slate-700">{tatami.name}</span>
                <span className="text-slate-500">
                  {done}/{total} {t('dashboard.done')}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded bg-slate-100">
                <div className="h-full rounded" style={{ width: `${total ? (done / total) * 100 : 0}%`, background: 'var(--accent)' }} />
              </div>
            </div>
          ))}
          {perTatami.length === 0 && <div className="text-sm text-slate-400">{t('dashboard.noArena')}</div>}
        </div>
      </div>

      <div className="flex gap-3">
        <Link to="/import" className="btn-primary">{t('nav.import')}</Link>
        <Link to="/categories" className="btn-ghost">{t('nav.categories')}</Link>
      </div>
    </div>
  );
}
