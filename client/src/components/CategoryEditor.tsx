import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useRanks, useTatamis } from '../lib/queries';
import { firstRoundBouts } from '../lib/bracketSeed';
import { useI18n } from '../i18n';

interface Entry {
  fighterId: number;
  seed: number;
  fighter: { id: number; firstName: string; lastName: string; age: number; weight: number; gender: string | null; rank: { name: string } };
}
interface CatDetail {
  id: number;
  name: string;
  tatamiId: number | null;
  gender: string | null;
  ageMin: number | null;
  ageMax: number | null;
  weightMin: number | null;
  weightMax: number | null;
  boutDurationSec: number;
  isSpecial: boolean;
  entries: Entry[];
}
const num = (v: any) => (v === '' || v == null ? null : Number(v));

export default function CategoryEditor({ categoryId, onClose }: { categoryId: number; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: tatamis } = useTatamis();
  const { data: ranks } = useRanks();
  const { data: cat } = useQuery<CatDetail>({ queryKey: ['category', categoryId], queryFn: () => api.get('/api/categories/' + categoryId) });
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newF, setNewF] = useState<any>({ firstName: '', lastName: '', age: '', weight: '', gender: '', rankId: '' });
  const { data: found } = useQuery<any[]>({ queryKey: ['fighters', search], queryFn: () => api.get('/api/fighters?q=' + encodeURIComponent(search)) });

  const [crit, setCrit] = useState<any>({});
  useEffect(() => { if (cat) setName(cat.name); }, [cat?.name]);
  useEffect(() => {
    if (cat) setCrit({ gender: cat.gender ?? '', ageMin: cat.ageMin ?? '', ageMax: cat.ageMax ?? '', weightMin: cat.weightMin ?? '', weightMax: cat.weightMax ?? '', boutDurationSec: cat.boutDurationSec ?? 90 });
  }, [cat?.id]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['category', categoryId] });
    qc.invalidateQueries({ queryKey: ['categories'] });
    qc.invalidateQueries({ queryKey: ['unassigned'] });
    qc.invalidateQueries({ queryKey: ['fighters'] });
    qc.invalidateQueries({ queryKey: ['bracket', categoryId] });
  };

  const rename = useMutation({ mutationFn: () => api.put('/api/categories/' + categoryId, { name }), onSuccess: invalidate });
  const setTatami = useMutation({ mutationFn: (tid: number | null) => api.put('/api/categories/' + categoryId, { tatamiId: tid }), onSuccess: invalidate });
  const add = useMutation({ mutationFn: (fid: number) => api.post(`/api/categories/${categoryId}/entries`, { fighterId: fid }), onSuccess: () => { setSearch(''); setFocused(false); invalidate(); }, onError: (e: any) => alert(e.message) });
  const createFighter = useMutation({
    mutationFn: async () => {
      const f: any = await api.post('/api/fighters', {
        firstName: newF.firstName, lastName: newF.lastName,
        age: Number(newF.age), weight: Number(newF.weight),
        gender: newF.gender || null, rankId: Number(newF.rankId),
      });
      await api.post(`/api/categories/${categoryId}/entries`, { fighterId: f.id });
    },
    onSuccess: () => { setShowNew(false); setNewF({ firstName: '', lastName: '', age: '', weight: '', gender: '', rankId: '' }); invalidate(); },
    onError: (e: any) => alert(e.message),
  });
  const remove = useMutation({ mutationFn: (fid: number) => api.del(`/api/categories/${categoryId}/entries/${fid}`), onSuccess: invalidate });
  const reorder = useMutation({ mutationFn: (ids: number[]) => api.post(`/api/categories/${categoryId}/entries/reorder`, { orderedFighterIds: ids }), onSuccess: invalidate });
  const gen = useMutation({
    mutationFn: () => api.post(`/api/categories/${categoryId}/bracket`, { mode: 'manual' }),
    onSuccess: () => { invalidate(); onClose(); navigate(`/bracket/${categoryId}`); },
    onError: (e: any) => alert(e.message),
  });
  const saveCrit = useMutation({
    mutationFn: () => api.put('/api/categories/' + categoryId, { gender: crit.gender || null, ageMin: num(crit.ageMin), ageMax: num(crit.ageMax), weightMin: num(crit.weightMin), weightMax: num(crit.weightMax), boutDurationSec: Number(crit.boutDurationSec) || 90 }),
    onSuccess: invalidate,
  });
  const [fillMsg, setFillMsg] = useState('');
  const fill = useMutation({
    mutationFn: () => api.post(`/api/categories/${categoryId}/fill`),
    onSuccess: (r: any) => { invalidate(); setFillMsg(r.added > 0 ? t('categories.filled', { n: r.added }) : t('categories.fillNone')); },
    onError: (e: any) => alert(e.message),
  });

  const entries = useMemo(() => [...(cat?.entries ?? [])].sort((a, b) => a.seed - b.seed), [cat]);
  const bouts = useMemo(() => firstRoundBouts(entries), [entries]);
  const inCat = new Set(entries.map((e) => e.fighterId));
  const move = (idx: number, dir: number) => {
    const arr = entries.map((e) => e.fighterId);
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    reorder.mutate(arr);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card max-h-[88vh] w-full max-w-2xl space-y-4 overflow-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <input className="input flex-1 text-base font-semibold" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== cat?.name && rename.mutate()} />
          <select className="input w-40 py-1.5" value={cat?.tatamiId ?? ''} onChange={(e) => setTatami.mutate(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{t('categories.unassigned')}</option>
            {(tatamis ?? []).map((tt) => <option key={tt.id} value={tt.id}>{tt.name}</option>)}
          </select>
          <button className="btn-ghost" onClick={onClose}>{t('common.close')}</button>
        </div>

        <div className="space-y-2 rounded-lg border border-slate-100 p-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('categories.criteria')}</div>
            <button className="btn-ghost text-xs" disabled={fill.isPending} onClick={() => fill.mutate()}>+ {t('categories.fillMatching')}</button>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div>
              <label className="label">{t('fighters.gender')}</label>
              <select className="input py-1.5" value={crit.gender ?? ''} onChange={(e) => { setCrit({ ...crit, gender: e.target.value }); setTimeout(() => saveCrit.mutate(), 0); }}>
                <option value="">—</option><option value="M">M</option><option value="F">F</option>
              </select>
            </div>
            <div>
              <label className="label">{t('categories.ageRange')}</label>
              <div className="flex items-center gap-1">
                <input type="number" className="input" title={t('common.min')} value={crit.ageMin ?? ''} onChange={(e) => setCrit({ ...crit, ageMin: e.target.value })} onBlur={() => saveCrit.mutate()} placeholder={t('common.min')} />
                <span className="text-slate-400">–</span>
                <input type="number" className="input" title={t('common.max')} value={crit.ageMax ?? ''} onChange={(e) => setCrit({ ...crit, ageMax: e.target.value })} onBlur={() => saveCrit.mutate()} placeholder={t('common.max')} />
              </div>
              <div className="mt-0.5 flex justify-between px-1 text-[10px] uppercase tracking-wide text-slate-400"><span>{t('common.min')}</span><span>{t('common.max')}</span></div>
            </div>
            <div>
              <label className="label">{t('categories.weightRange')}</label>
              <div className="flex items-center gap-1">
                <input type="number" className="input" title={t('common.min')} value={crit.weightMin ?? ''} onChange={(e) => setCrit({ ...crit, weightMin: e.target.value })} onBlur={() => saveCrit.mutate()} placeholder={t('common.min')} />
                <span className="text-slate-400">–</span>
                <input type="number" className="input" title={t('common.max')} value={crit.weightMax ?? ''} onChange={(e) => setCrit({ ...crit, weightMax: e.target.value })} onBlur={() => saveCrit.mutate()} placeholder={t('common.max')} />
              </div>
              <div className="mt-0.5 flex justify-between px-1 text-[10px] uppercase tracking-wide text-slate-400"><span>{t('common.min')}</span><span>{t('common.max')}</span></div>
            </div>
            <div>
              <label className="label">{t('categories.boutTime')}</label>
              <input type="number" className="input" value={crit.boutDurationSec ?? 90} onChange={(e) => setCrit({ ...crit, boutDurationSec: e.target.value })} onBlur={() => saveCrit.mutate()} />
            </div>
          </div>
          {fillMsg && <div className="rounded bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">{fillMsg}</div>}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700">{t('categories.members')} ({entries.length})</div>
            <button className="btn-primary text-xs" disabled={entries.length < 2 || gen.isPending} onClick={() => gen.mutate()}>{t('categories.generateBracket')}</button>
          </div>
          <div className="mb-2 text-xs text-slate-500">{t('categories.reorderHint')}</div>
          <div className="divide-y divide-slate-50 rounded-lg border border-slate-100">
            {entries.map((e, idx) => (
              <div key={e.fighterId} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                <span className="w-6 text-center text-xs font-semibold text-slate-400">{idx + 1}</span>
                <span className="font-medium text-slate-800">{e.fighter.firstName} {e.fighter.lastName}</span>
                <span className="text-xs text-slate-500">{e.fighter.gender ?? ''} · {e.fighter.age}y · {e.fighter.weight}kg · {e.fighter.rank?.name}</span>
                <div className="ml-auto flex items-center gap-1">
                  <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => move(idx, -1)}>↑</button>
                  <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => move(idx, 1)}>↓</button>
                  <button className="px-1 text-xs text-red-500 hover:underline" onClick={() => remove.mutate(e.fighterId)}>✕</button>
                </div>
              </div>
            ))}
            {entries.length === 0 && <div className="px-2 py-2 text-sm text-slate-400">—</div>}
          </div>

          {bouts.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('categories.firstRoundBouts')}</div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {bouts.map((b, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5 text-xs">
                    <span className="badge shrink-0 bg-slate-800 text-white">{t('categories.bout')} {i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-blue-600" title={b[0] ? `${b[0].fighter.firstName} ${b[0].fighter.lastName}` : ''}>{b[0] ? `${b[0].fighter.firstName} ${b[0].fighter.lastName}` : '—'}</span>
                    <span className="shrink-0 font-semibold text-slate-400">vs</span>
                    <span className="min-w-0 flex-1 truncate text-right font-medium text-red-600" title={b[1] ? `${b[1].fighter.firstName} ${b[1].fighter.lastName}` : ''}>{b[1] ? `${b[1].fighter.firstName} ${b[1].fighter.lastName}` : t('categories.bye')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder={t('categories.addFighter')}
              value={search}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 200)}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="btn-ghost shrink-0" onClick={() => setShowNew((s) => !s)}>+ {t('categories.newFighter')}</button>
          </div>
          {focused && (
            <div className="mt-1 max-h-56 divide-y divide-slate-50 overflow-auto rounded-lg border border-slate-100">
              <div className="px-2 py-1 text-[11px] text-slate-400">{t('categories.chooseHint')}</div>
              {(found ?? []).filter((f) => !inCat.has(f.id)).slice(0, 50).map((f) => {
                // A fighter already in another group can't join a second regular group (avoids duplicate fights).
                const conflict = !cat?.isSpecial && !!f.categoryName;
                return (
                  <button key={f.id} className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-slate-50" onMouseDown={() => add.mutate(f.id)}>
                    <span className="font-medium text-slate-800">{f.firstName} {f.lastName}</span>
                    <span className="text-xs text-slate-500">{f.gender ?? ''} · {f.age}y · {f.weight}kg · {f.rank?.name}</span>
                    {f.categoryName && <span className={`text-xs ${conflict ? 'font-medium text-amber-600' : 'text-slate-400'}`}>· {conflict ? t('categories.alreadyIn', { name: f.categoryName }) : f.categoryName}</span>}
                    <span className="ml-auto text-xs font-medium text-blue-600">+ {t('common.add')}</span>
                  </button>
                );
              })}
              {(found ?? []).filter((f) => !inCat.has(f.id)).length === 0 && <div className="px-2 py-2 text-sm text-slate-400">—</div>}
            </div>
          )}
          {showNew && (
            <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-3">
              <input className="input" placeholder="First" value={newF.firstName} onChange={(e) => setNewF({ ...newF, firstName: e.target.value })} />
              <input className="input" placeholder="Last" value={newF.lastName} onChange={(e) => setNewF({ ...newF, lastName: e.target.value })} />
              <select className="input py-1.5" value={newF.rankId} onChange={(e) => setNewF({ ...newF, rankId: e.target.value })}>
                <option value="">{t('fighters.rank')}</option>
                {(ranks ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <input type="number" className="input" placeholder={t('fighters.age')} value={newF.age} onChange={(e) => setNewF({ ...newF, age: e.target.value })} />
              <input type="number" className="input" placeholder={`${t('fighters.weight')} (kg)`} value={newF.weight} onChange={(e) => setNewF({ ...newF, weight: e.target.value })} />
              <select className="input py-1.5" value={newF.gender} onChange={(e) => setNewF({ ...newF, gender: e.target.value })}>
                <option value="">{t('fighters.gender')}</option><option value="M">M</option><option value="F">F</option>
              </select>
              <button className="btn-primary col-span-2 md:col-span-3" disabled={!newF.firstName || !newF.lastName || !newF.rankId || !newF.age || !newF.weight || createFighter.isPending} onClick={() => createFighter.mutate()}>
                {t('common.create')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
