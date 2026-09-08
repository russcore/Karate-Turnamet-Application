import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useTatamis } from '../lib/queries';
import { useLive } from '../lib/ws';
import { useI18n } from '../i18n';

interface Category {
  id: number;
  name: string;
  tatamiId: number | null;
  status: string;
  entryCount: number;
}

export default function TatamiView() {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: tatamis } = useTatamis();
  const { data: categories } = useQuery<Category[]>({ queryKey: ['categories'], queryFn: () => api.get('/api/categories') });
  const { connected } = useLive(['all'], () => qc.invalidateQueries({ queryKey: ['categories'] }));

  const myTatamiIds = user?.role === 'admin' ? (tatamis ?? []).map((t) => t.id) : user?.tatamiIds ?? [];
  const [active, setActive] = useState<number | null>(null);
  const shown = active ?? myTatamiIds[0] ?? null;

  const cats = (categories ?? []).filter((c) => c.tatamiId != null && c.tatamiId === shown);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{t('tatamiView.title')}</h1>
        {!connected && <span className="badge bg-amber-100 text-amber-700">{t('tatamiView.offline')}</span>}
      </div>

      {myTatamiIds.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {(tatamis ?? []).filter((tt) => myTatamiIds.includes(tt.id)).map((tt) => (
            <button key={tt.id} onClick={() => setActive(tt.id)} className={`btn ${shown === tt.id ? 'btn-primary' : 'btn-ghost'}`}>
              {tt.name}
            </button>
          ))}
        </div>
      )}

      <div className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t('tatamiView.queue')}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        {cats.map((c) => (
          <Link key={c.id} to={`/bracket/${c.id}`} className="card flex items-center justify-between p-4 hover:border-slate-400">
            <div>
              <div className="text-lg font-semibold text-slate-800">{c.name}</div>
              <div className="text-sm text-slate-500">{c.entryCount} {t('categories.entries')}</div>
            </div>
            <span className={`badge ${c.status === 'done' ? 'bg-emerald-100 text-emerald-700' : c.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{c.status}</span>
          </Link>
        ))}
        {cats.length === 0 && <div className="text-sm text-slate-400">{t('projector.noCategories')}</div>}
      </div>
    </div>
  );
}
