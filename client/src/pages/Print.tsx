import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useEvent } from '../lib/queries';
import { useI18n } from '../i18n';
import BracketView from '../components/BracketView';
import type { BracketState } from '../lib/bracketTypes';

export default function Print() {
  const { categoryId } = useParams();
  const id = Number(categoryId);
  const { t } = useI18n();
  const { data: event } = useEvent();
  const category = useQuery({ queryKey: ['category', id], queryFn: () => api.get('/api/categories/' + id) });
  const bracket = useQuery<BracketState>({ queryKey: ['bracket', id], queryFn: () => api.get(`/api/categories/${id}/bracket`), retry: false });

  const arena = category.data?.tatami as { name?: string; imagePath?: string | null } | undefined;
  const arenaName = arena?.name;
  const arenaImg = arena?.imagePath || event?.defaultTatamiImage || '/default-tatami.svg';

  return (
    <div className="min-h-screen bg-white p-8 text-slate-900">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <span className="text-sm text-slate-500">Print preview</span>
        <button className="btn-primary" onClick={() => window.print()}>🖨 Print</button>
      </div>

      <div className="flex items-center justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-3">
          <img src={event?.logoPath || '/canva-logo.png'} className="h-12 w-12 object-contain" />
          <div>
            <div className="text-2xl font-black">{event?.title}</div>
            <div className="text-lg font-semibold text-slate-700">{category.data?.name}</div>
            {arenaName && <div className="text-sm text-slate-500">{t('nav.tatami')}: {arenaName}</div>}
          </div>
        </div>
        {/* Arena illustration */}
        <div className="text-center">
          <img src={arenaImg} alt="arena" className="h-20 w-32 rounded object-cover ring-1 ring-slate-200" />
          {arenaName && <div className="mt-1 text-xs font-medium text-slate-500">{arenaName}</div>}
        </div>
      </div>

      <div className="mt-6">
        {bracket.data ? (
          <BracketView state={bracket.data} categoryName={category.data?.name} showUpNext={false} />
        ) : (
          <div className="text-slate-400">No bracket generated.</div>
        )}
      </div>
    </div>
  );
}
