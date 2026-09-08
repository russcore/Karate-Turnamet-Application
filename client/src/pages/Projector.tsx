import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useEvent, useTatamis } from '../lib/queries';
import { useLive } from '../lib/ws';
import { LanguageSwitcher, useI18n } from '../i18n';
import BracketView from '../components/BracketView';
import Podium from '../components/Podium';
import { fighterMap, type BracketState } from '../lib/bracketTypes';
import { orderedMatches } from '../lib/fightOrder';

interface Category {
  id: number;
  name: string;
  tatamiId: number | null;
  status: string;
}

interface TimerMsg {
  kind: 'bout' | 'break';
  state: 'running' | 'paused' | 'reset' | 'done';
  endsAt: number | null;
  remaining?: number;
  label?: string;
}

const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;

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
  const [boutTimer, setBoutTimer] = useState<TimerMsg | null>(null);
  const [breakTimer, setBreakTimer] = useState<TimerMsg | null>(null);
  const [now, setNow] = useState(Date.now());
  const [announced, setAnnounced] = useState<number | null>(null);

  useEffect(() => {
    if (event?.accentColor) document.documentElement.style.setProperty('--accent', event.accentColor);
  }, [event?.accentColor]);
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(iv);
  }, []);

  const shownTatami = activeTatami ?? tatamis?.[0]?.id ?? null;
  const cats = (categories ?? []).filter((c) => c.tatamiId === shownTatami);
  const shownCat = activeCat ?? cats.find((c) => c.status === 'in_progress')?.id ?? cats.find((c) => c.status !== 'done')?.id ?? cats[0]?.id ?? null;
  const tatami = (tatamis ?? []).find((tt) => tt.id === shownTatami);

  // Clear timers when the shown arena changes.
  useEffect(() => { setBoutTimer(null); setBreakTimer(null); }, [shownTatami]);

  const bracket = useQuery<BracketState>({
    queryKey: ['bracket', shownCat],
    queryFn: () => api.get(`/api/categories/${shownCat}/bracket`),
    enabled: shownCat != null,
    retry: false,
  });

  useLive(
    ['all'],
    () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      if (shownCat != null) qc.invalidateQueries({ queryKey: ['bracket', shownCat] });
    },
    (msg) => {
      if (msg.type === 'podium') setAnnounced(msg.categoryId);
      if (msg.type === 'timer' && msg.tatamiId === shownTatami) {
        if (msg.kind === 'bout') setBoutTimer(msg);
        else setBreakTimer(msg);
      }
    },
  );
  const announcedBracket = useQuery<BracketState>({
    queryKey: ['bracket', announced],
    queryFn: () => api.get(`/api/categories/${announced}/bracket`),
    enabled: announced != null,
    retry: false,
  });

  // --- Derived live status for the shown arena ---
  const state = bracket.data;
  const matches = state?.bracket.matches ?? [];
  const fmap = useMemo(() => (state ? fighterMap(state) : new Map()), [state]);
  const current = orderedMatches(matches).find((m) => m.status === 'ready' && m.fighterAId != null && m.fighterBId != null && m.winnerId == null);
  const nameOf = (id: number | null) => { const f = id != null ? fmap.get(id) : undefined; return f ? `${f.firstName} ${f.lastName}` : '—'; };
  const totalBouts = matches.filter((m) => m.status !== 'bye').length;
  const doneBouts = matches.filter((m) => m.status === 'done').length;
  const catsTotal = cats.length;
  const catsDone = cats.filter((c) => c.status === 'done').length;
  const shownCatName = cats.find((c) => c.id === shownCat)?.name;
  const finished = !!state && state.placements.length > 0;

  const cornerA = { name: event?.cornerAName ?? 'AO', color: event?.cornerAColor ?? '#2563eb' };
  const cornerB = { name: event?.cornerBName ?? 'AKA', color: event?.cornerBColor ?? '#dc2626' };

  const display = (tm: TimerMsg | null) => {
    if (!tm || tm.state === 'reset') return null;
    if (tm.state === 'done') return { text: fmt(0), done: true, running: false, paused: false, warn: true };
    if (tm.state === 'running' && tm.endsAt) {
      const rem = Math.max(0, Math.round((tm.endsAt - now) / 1000));
      return { text: fmt(rem), done: rem <= 0, running: rem > 0, paused: false, warn: rem <= 10 };
    }
    if (tm.state === 'paused') return { text: fmt(tm.remaining ?? 0), done: false, running: false, paused: true, warn: false };
    return null;
  };
  const boutD = display(boutTimer);
  const breakD = display(breakTimer);

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

      {/* Arena selector */}
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

      {/* ===== Live status board ===== */}
      <div className="px-8">
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Now fighting */}
          <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 lg:col-span-2">
            <div className="mb-2 text-sm font-semibold uppercase tracking-widest text-white/50">{t('projector.nowFighting')}</div>
            {current && !finished ? (
              <div>
                <div className="flex items-center gap-3 text-2xl font-bold sm:text-3xl">
                  <span className="rounded px-2 py-0.5 text-sm font-black text-white" style={{ background: cornerA.color }}>{cornerA.name}</span>
                  <span>{nameOf(current.fighterAId)}</span>
                  <span className="text-white/40">{t('bracket.vs')}</span>
                  <span>{nameOf(current.fighterBId)}</span>
                  <span className="rounded px-2 py-0.5 text-sm font-black text-white" style={{ background: cornerB.color }}>{cornerB.name}</span>
                </div>
                <div className="mt-2 text-white/60">{shownCatName} · {tatami?.name}</div>
              </div>
            ) : (
              <div className="py-6 text-2xl text-white/40">{finished ? t('projector.arenaDone') : t('projector.waiting')}</div>
            )}
          </div>

          {/* Timers */}
          <div className="grid grid-rows-2 gap-4">
            <div className={`flex items-center justify-between rounded-2xl px-6 ring-1 ${boutD?.warn ? 'bg-red-500/20 ring-red-400/40' : 'bg-white/5 ring-white/10'}`}>
              <div className="text-sm font-semibold uppercase tracking-widest text-white/50">{t('projector.fightTime')}</div>
              <div className={`font-mono text-4xl font-black tabular-nums ${boutD ? (boutD.warn ? 'text-red-300' : 'text-white') : 'text-white/25'}`}>
                {boutD ? boutD.text : '–:––'}
                {boutD?.paused && <span className="ml-2 align-middle text-xs text-white/50">⏸</span>}
              </div>
            </div>
            <div className={`flex items-center justify-between rounded-2xl px-6 ring-1 ${breakD ? 'bg-amber-500/20 ring-amber-400/40' : 'bg-white/5 ring-white/10'}`}>
              <div className="text-sm font-semibold uppercase tracking-widest text-white/50">☕ {t('break.title')}</div>
              <div className={`font-mono text-4xl font-black tabular-nums ${breakD ? 'text-amber-200' : 'text-white/25'}`}>
                {breakD ? breakD.text : '–:––'}
                {breakD?.paused && <span className="ml-2 align-middle text-xs text-white/50">⏸</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Progress */}
        {shownCat && (
          <div className="mt-4 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
            <div className="mb-1 flex justify-between text-sm text-white/60">
              <span>{t('projector.progress')}: {shownCatName}</span>
              <span>{doneBouts}/{totalBouts} {t('categories.entries')} · {catsDone}/{catsTotal} {t('dashboard.categories').toLowerCase()}</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded bg-white/10">
              <div className="h-full rounded" style={{ width: `${totalBouts ? (doneBouts / totalBouts) * 100 : 0}%`, background: 'var(--accent)' }} />
            </div>
          </div>
        )}
      </div>

      {/* Category selector */}
      <div className="flex flex-wrap gap-2 px-8 pt-6">
        {cats.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveCat(c.id)}
            className={`rounded px-3 py-1 text-sm ${shownCat === c.id ? 'bg-white text-slate-900' : c.status === 'done' ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/10 text-white/70'}`}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="space-y-6 p-8">
        {finished && state && <Podium medals={medalsFrom(state)} title={shownCatName} />}
        {shownCat && state ? (
          <div className="rounded-xl bg-white p-6 text-slate-900">
            <BracketView state={state} tatamiName={tatami?.name} tatamiImage={tatami?.imagePath ?? event?.defaultTatamiImage} categoryName={shownCatName} showUpNext={false} />
          </div>
        ) : (
          <div className="py-16 text-center text-2xl text-white/50">{t('projector.noCategories')}</div>
        )}
      </div>

      {/* Full-screen podium announcement (triggered from an arena). */}
      {announced != null && announcedBracket.data && announcedBracket.data.placements.length > 0 && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/95 p-8" onClick={() => setAnnounced(null)}>
          <div className="w-full max-w-4xl">
            <Podium medals={medalsFrom(announcedBracket.data)} title={(categories ?? []).find((c) => c.id === announced)?.name} />
          </div>
          <div className="mt-6 text-sm text-white/40">{t('common.tapDismiss')}</div>
        </div>
      )}
    </div>
  );
}
