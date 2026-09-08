import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useEvent, useTatamis } from '../lib/queries';
import { useLive } from '../lib/ws';
import { useI18n } from '../i18n';
import BracketView from '../components/BracketView';
import BreakTimer from '../components/BreakTimer';
import Podium from '../components/Podium';
import type { BracketState } from '../lib/bracketTypes';

const DECISIONS = ['ippon', 'waza-ari', 'hantei', 'shikkaku', 'kiken'] as const;

function medalsFrom(state: BracketState) {
  const fm = new Map(state.fighters.map((f) => [f.id, f]));
  return state.placements
    .filter((p) => p.place <= 3)
    .map((p) => { const f = fm.get(p.fighterId); return { place: p.place, name: f ? `${f.firstName} ${f.lastName}` : String(p.fighterId), school: f?.school }; });
}

interface PendingWin { matchId: number; winnerId: number; version: number; fighterAId: number | null }

export default function BracketPage() {
  const { categoryId } = useParams();
  const id = Number(categoryId);
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: event } = useEvent();
  const { data: tatamis } = useTatamis();

  const category = useQuery({ queryKey: ['category', id], queryFn: () => api.get('/api/categories/' + id) });
  const bracket = useQuery<BracketState>({ queryKey: ['bracket', id], queryFn: () => api.get(`/api/categories/${id}/bracket`), retry: false });

  useLive([`category:${id}`], () => {
    qc.invalidateQueries({ queryKey: ['bracket', id] });
    qc.invalidateQueries({ queryKey: ['category', id] });
  });

  const cat = category.data;
  const tatami = (tatamis ?? []).find((tt) => tt.id === cat?.tatamiId);
  const canEdit = user?.role === 'admin' || (user?.role === 'tatami_editor' && cat?.tatamiId != null && user.tatamiIds.includes(cat.tatamiId));

  const [pendingWin, setPendingWin] = useState<PendingWin | null>(null);
  const [scoreW, setScoreW] = useState('');
  const [scoreL, setScoreL] = useState('');
  const [confirmRevert, setConfirmRevert] = useState<number | null>(null);
  const [showPodium, setShowPodium] = useState(false);
  const [timeUp, setTimeUp] = useState<string | null>(null);

  const pick = useMutation({
    mutationFn: (p: PendingWin & { decision: string }) => {
      const sw = scoreW === '' ? undefined : Number(scoreW);
      const sl = scoreL === '' ? undefined : Number(scoreL);
      const scoreA = p.fighterAId === p.winnerId ? sw : sl;
      const scoreB = p.fighterAId === p.winnerId ? sl : sw;
      return api.post(`/api/matches/${p.matchId}/result`, { winnerId: p.winnerId, expectedVersion: p.version, decision: p.decision, scoreA, scoreB });
    },
    onSuccess: (state) => { qc.setQueryData(['bracket', id], state); setPendingWin(null); setScoreW(''); setScoreL(''); },
    onError: (e) => {
      alert(e instanceof ApiError && e.status === 409 ? 'Someone else changed this match — reloading.' : (e as Error).message);
      qc.invalidateQueries({ queryKey: ['bracket', id] });
      setPendingWin(null);
    },
  });
  const revert = useMutation({
    mutationFn: (matchId: number) => api.post(`/api/matches/${matchId}/revert`),
    onSuccess: (state) => { qc.setQueryData(['bracket', id], state); setConfirmRevert(null); },
    onError: (e) => { alert((e as Error).message); qc.invalidateQueries({ queryKey: ['bracket', id] }); setConfirmRevert(null); },
  });
  const reorder = useMutation({
    mutationFn: ({ matchId, direction }: { matchId: number; direction: 'now' | 'later' }) => api.post(`/api/matches/${matchId}/reorder`, { direction }),
    onSuccess: (state) => qc.setQueryData(['bracket', id], state),
    onError: (e) => { alert((e as Error).message); qc.invalidateQueries({ queryKey: ['bracket', id] }); },
  });
  const announce = useMutation({ mutationFn: () => api.post(`/api/categories/${id}/announce`), onError: (e: any) => alert(e.message) });

  if (bracket.isError) return <div className="text-slate-500">{t('bracket.notGenerated')}</div>;
  if (!bracket.data) return <div className="text-slate-500">{t('common.loading')}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{cat?.name}</h1>
          <div className="text-sm text-slate-500">{tatami?.name}</div>
        </div>
        <div className="flex items-center gap-2">
          {bracket.data.placements.length > 0 && (
            <button className="btn-primary text-sm" disabled={announce.isPending} onClick={() => { announce.mutate(); setShowPodium(true); }}>🏆 {t('podium.announce')}</button>
          )}
          <a href={`/print/${id}`} target="_blank" className="btn-ghost text-sm">🖨 {t('nav.print')}</a>
        </div>
      </div>

      {bracket.data.placements.length > 0 && (
        <div className="mx-auto max-w-2xl">
          <Podium medals={medalsFrom(bracket.data)} title={cat?.name} />
        </div>
      )}

      {canEdit && bracket.data.placements.length === 0 && <BreakTimer />}

      <BracketView
        state={bracket.data}
        editable={canEdit}
        tatamiName={tatami?.name}
        tatamiImage={tatami?.imagePath ?? event?.defaultTatamiImage}
        categoryName={cat?.name}
        boutDurationSec={cat?.boutDurationSec ?? 90}
        onPickWinner={(matchId, winnerId, version, fighterAId) => { setScoreW(''); setScoreL(''); setPendingWin({ matchId, winnerId, version, fighterAId }); }}
        onRevert={(matchId) => setConfirmRevert(matchId)}
        onTimeUp={(label) => setTimeUp(label)}
        onReorder={canEdit ? (matchId, direction) => reorder.mutate({ matchId, direction }) : undefined}
      />

      {pendingWin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPendingWin(null)}>
          <div className="card w-full max-w-md space-y-4 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-semibold text-slate-800">{t('result.how')}</div>
            <div>
              <label className="label">{t('result.score')}</label>
              <div className="flex items-center gap-2">
                <input type="number" className="input w-24" value={scoreW} onChange={(e) => setScoreW(e.target.value)} placeholder="—" />
                <span className="text-slate-400">:</span>
                <input type="number" className="input w-24" value={scoreL} onChange={(e) => setScoreL(e.target.value)} placeholder="—" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {DECISIONS.map((dec) => (
                <button
                  key={dec}
                  className={dec === 'shikkaku' ? 'btn-danger' : 'btn-primary'}
                  disabled={pick.isPending}
                  onClick={() => pick.mutate({ ...pendingWin, decision: dec })}
                >
                  {t('decision.' + dec)}
                </button>
              ))}
              <button className="btn-ghost col-span-2" onClick={() => setPendingWin(null)}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {showPodium && bracket.data.placements.length > 0 && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/95 p-8" onClick={() => setShowPodium(false)}>
          <div className="w-full max-w-3xl"><Podium medals={medalsFrom(bracket.data)} title={cat?.name} /></div>
          <div className="mt-4 text-sm text-white/50">📡 Shown on all projector screens · tap to dismiss</div>
        </div>
      )}

      {timeUp != null && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-red-900/70 p-8 backdrop-blur-sm" onClick={() => setTimeUp(null)}>
          <div className="animate-pulse rounded-2xl bg-red-600 px-12 py-8 text-center shadow-2xl">
            <div className="text-6xl font-black uppercase tracking-wider text-white">⏱ {t('timer.timeUp')}</div>
            <div className="mt-3 text-2xl font-semibold text-white/90">{timeUp}</div>
          </div>
          <div className="mt-6 text-sm text-white/70">{t('common.tapDismiss')}</div>
        </div>
      )}

      {confirmRevert != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmRevert(null)}>
          <div className="card w-full max-w-sm space-y-4 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm text-slate-700">{t('bracket.revertWarn')}</div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setConfirmRevert(null)}>{t('common.cancel')}</button>
              <button className="btn-danger" disabled={revert.isPending} onClick={() => revert.mutate(confirmRevert)}>{t('bracket.revert')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
