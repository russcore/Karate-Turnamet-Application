import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useEvent, useTatamis } from '../lib/queries';
import { useLive } from '../lib/ws';
import { useI18n } from '../i18n';
import BracketView from '../components/BracketView';
import Podium from '../components/Podium';
import { LanguageSwitcher } from '../i18n';
import type { BracketState } from '../lib/bracketTypes';

interface Category {
  id: number;
  name: string;
  tatamiId: number | null;
  status: string;
}

function medalsFrom(state: BracketState) {
  const fm = new Map(state.fighters.map((f) => [f.id, f]));
  return state.placements
    .filter((p) => p.place <= 3)
    .map((p) => {
      const f = fm.get(p.fighterId);
      return { place: p.place, name: f ? `${f.firstName} ${f.lastName}` : String(p.fighterId), school: f?.school };
    });
}

export default function Projector() {
  const { tatamiId } = useParams();
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data: event } = useEvent();
  const { data: tatamis } = useTatamis();
  const { data: categories } = useQuery<Category[]>({ queryKey: ['categories'], queryFn: () => api.get('/api/categories') });

  const [activeTatami, setActiveTatami] = useState<number | null>(tatamiId ? Number(tatamiId) : null);
  const [activeCat, setActiveCat] = useState<number | null>(null);

  useEffect(() => {
    if (event?.accentColor) document.documentElement.style.setProperty('--accent', event.accentColor);
  }, [event?.accentColor]);

  const shownTatami = activeTatami ?? tatamis?.[0]?.id ?? null;
  const cats = (categories ?? []).filter((c) => c.tatamiId === shownTatami);
  const shownCat = activeCat ?? cats.find((c) => c.status === 'in_progress')?.id ?? cats[0]?.id ?? null;
  const tatami = (tatamis ?? []).find((tt) => tt.id === shownTatami);

  const bracket = useQuery<BracketState>({
    queryKey: ['bracket', shownCat],
    queryFn: () => api.get(`/api/categories/${shownCat}/bracket`),
    enabled: shownCat != null,
    retry: false,
  });

  const [announced, setAnnounced] = useState<number | null>(null);
  useLive(
    ['all'],
    () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      if (shownCat != null) qc.invalidateQueries({ queryKey: ['bracket', shownCat] });
    },
    (msg) => { if (msg.type === 'podium') setAnnounced(msg.categoryId); },
  );
  const announcedBracket = useQuery<BracketState>({
    queryKey: ['bracket', announced],
    queryFn: () => api.get(`/api/categories/${announced}/bracket`),
    enabled: announced != null,
    retry: false,
  });

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="flex items-center justify-between px-8 py-4" style={{ background: 'var(--accent)' }}>
        <div className="flex items-center gap-4">
          <img src={event?.logoPath || '/canva-logo.png'} className="h-14 w-14 rounded-xl bg-white/15 object-contain p-1 ring-1 ring-white/20" />
          <div>
            <div className="text-3xl font-black">{event?.title}</div>
            {event?.subtitle && <div className="opacity-80">{event.subtitle}</div>}
          </div>
        </div>
        <LanguageSwitcher />
      </header>

      <div className="flex flex-wrap gap-2 px-8 py-4">
        {(tatamis ?? []).map((tt) => (
          <button
            key={tt.id}
            onClick={() => { setActiveTatami(tt.id); setActiveCat(null); }}
            className={`rounded-lg px-4 py-2 text-lg font-bold ${shownTatami === tt.id ? 'bg-white text-slate-900' : 'bg-white/10 text-white/80'}`}
          >
            {tt.name}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 px-8">
        {cats.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveCat(c.id)}
            className={`rounded px-3 py-1 text-sm ${shownCat === c.id ? 'bg-white text-slate-900' : 'bg-white/10 text-white/70'}`}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="space-y-6 p-8">
        {shownCat && bracket.data && bracket.data.placements.length > 0 && (
          <Podium medals={medalsFrom(bracket.data)} title={cats.find((c) => c.id === shownCat)?.name} />
        )}
        {shownCat && bracket.data ? (
          <div className="rounded-xl bg-white p-6 text-slate-900">
            <div className="mb-4 text-2xl font-bold">{cats.find((c) => c.id === shownCat)?.name}</div>
            <BracketView state={bracket.data} tatamiName={tatami?.name} tatamiImage={tatami?.imagePath ?? event?.defaultTatamiImage} categoryName={cats.find((c) => c.id === shownCat)?.name} />
          </div>
        ) : (
          <div className="py-24 text-center text-2xl text-white/50">{t('projector.noCategories')}</div>
        )}
      </div>

      {/* Full-screen podium announcement (triggered from a tatami). */}
      {announced != null && announcedBracket.data && announcedBracket.data.placements.length > 0 && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/95 p-8" onClick={() => setAnnounced(null)}>
          <div className="w-full max-w-4xl">
            <Podium medals={medalsFrom(announcedBracket.data)} title={(categories ?? []).find((c) => c.id === announced)?.name} />
          </div>
          <div className="mt-6 text-sm text-white/40">tap to dismiss</div>
        </div>
      )}
    </div>
  );
}
