import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useTatamis } from '../lib/queries';
import { useI18n } from '../i18n';
import CategoryEditor from '../components/CategoryEditor';

interface Category {
  id: number;
  name: string;
  gender: string | null;
  ageMin: number | null;
  ageMax: number | null;
  weightMin: number | null;
  weightMax: number | null;
  tatamiId: number | null;
  status: string;
  entryCount: number;
  isSpecial: boolean;
}

export default function Categories() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: tatamis } = useTatamis();
  const { data: categories } = useQuery<Category[]>({ queryKey: ['categories'], queryFn: () => api.get('/api/categories') });
  const [proposal, setProposal] = useState<any>(null);
  const [replace, setReplace] = useState(true);
  const [assignTatamis, setAssignTatamis] = useState(true);
  const [genBrackets, setGenBrackets] = useState(false);
  const [seedMode, setSeedMode] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['categories'] });
    qc.invalidateQueries({ queryKey: ['unassigned'] });
  };
  const { data: unassigned } = useQuery<any[]>({ queryKey: ['unassigned'], queryFn: () => api.get('/api/fighters/unassigned') });
  const { data: fcount } = useQuery<{ count: number }>({ queryKey: ['fighters', 'count'], queryFn: () => api.get('/api/fighters/count') });
  const [selected, setSelected] = useState<number[]>([]);
  const [boutTatami, setBoutTatami] = useState<number | ''>('');
  const createBout = useMutation({
    mutationFn: () => api.post('/api/categories/special-bout', { fighterIds: selected, tatamiId: boutTatami || null }),
    onSuccess: () => { setSelected([]); invalidate(); },
    onError: (e: any) => alert(e.message),
  });
  const toggleSel = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const [editingCat, setEditingCat] = useState<number | null>(null);
  const newGroup = useMutation({
    mutationFn: () => api.post('/api/categories', { name: t('categories.newGroup'), discipline: 'kumite' }),
    onSuccess: (c: any) => { invalidate(); setEditingCat(c.id); },
  });
  const newSpecial = useMutation({
    mutationFn: () => api.post('/api/categories', { name: 'Special bout', discipline: 'kumite', isSpecial: true }),
    onSuccess: (c: any) => { invalidate(); setEditingCat(c.id); },
  });
  const addToCat = useMutation({
    mutationFn: ({ catId, fighterId }: { catId: number; fighterId: number }) => api.post(`/api/categories/${catId}/entries`, { fighterId }),
    onSuccess: invalidate,
    onError: (e: any) => alert(e.message),
  });

  const preview = async () => {
    setBusy(true);
    try {
      setProposal(await api.get('/api/categories/grouping/preview'));
    } finally {
      setBusy(false);
    }
  };
  const apply = useMutation({
    mutationFn: () => api.post('/api/categories/grouping/apply', { groups: proposal.groups, replace, assignTatamis, generateBrackets: genBrackets }),
    onSuccess: () => { setProposal(null); invalidate(); },
  });
  const assign = useMutation({ mutationFn: ({ id, tatamiId }: { id: number; tatamiId: number | null }) => api.put(`/api/categories/${id}`, { tatamiId }), onSuccess: invalidate });
  const genBracket = useMutation({
    mutationFn: ({ id, mode }: { id: number; mode: string }) => api.post(`/api/categories/${id}/bracket`, { mode }),
    onSuccess: (_d, v) => { invalidate(); navigate(`/bracket/${v.id}`); },
    onError: (e: any) => alert(e.message),
  });
  const simulate = useMutation({
    mutationFn: (id: number) => api.post(`/api/categories/${id}/simulate`),
    onSuccess: invalidate,
    onError: (e: any) => alert(e.message),
  });
  const simulateAll = useMutation({
    mutationFn: (tatamiId?: number | null) => api.post('/api/categories/simulate-all', tatamiId ? { tatamiId } : {}),
    onSuccess: invalidate,
  });

  const groupsByTatami = [
    { id: null as number | null, name: t('categories.unassigned') },
    ...(tatamis ?? []).map((tt) => ({ id: tt.id as number | null, name: tt.name })),
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{t('categories.title')}</h1>
        <div className="flex gap-2">
          <button className="btn-ghost" disabled={newGroup.isPending} onClick={() => newGroup.mutate()}>+ {t('categories.newGroup')}</button>
          <button className="btn-ghost" disabled={newSpecial.isPending} onClick={() => newSpecial.mutate()}>⚔ {t('categories.newSpecial')}</button>
          <button className="btn-ghost" disabled={simulateAll.isPending} onClick={() => simulateAll.mutate(null)}>▶ {t('categories.simulateAll')}</button>
          <button className="btn-primary" disabled={busy} onClick={preview}>🤖 {t('categories.autoGroup')}</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="badge bg-emerald-100 px-3 py-1 text-emerald-700">
          {(fcount?.count ?? 0) - (unassigned?.length ?? 0)} {t('categories.assigned')}
        </span>
        <span className={`badge px-3 py-1 ${(unassigned?.length ?? 0) > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>
          {unassigned?.length ?? 0} {t('categories.unassignedCount')}
        </span>
        <span className="text-slate-400">/ {fcount?.count ?? 0} {t('dashboard.fighters').toLowerCase()}</span>
      </div>

      {proposal && (
        <div className="card space-y-3 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="font-semibold">{t('categories.provider')}: {proposal.provider}</span>
              <span className="ml-2 text-slate-500">{proposal.groups.length} groups</span>
            </div>
            <button className="text-slate-400 hover:text-slate-600" onClick={() => setProposal(null)}>✕</button>
          </div>
          {proposal.usedFallback && <div className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">{t('categories.usedFallback')}</div>}
          {proposal.ungrouped ? <div className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">{t('categories.ungrouped', { n: proposal.ungrouped })}</div> : null}
          {proposal.warnings?.map((w: string) => <div key={w} className="text-xs text-amber-600">{w}</div>)}
          <div className="grid max-h-64 grid-cols-2 gap-2 overflow-auto md:grid-cols-3">
            {proposal.groups.map((g: any, i: number) => (
              <div key={i} className="rounded-lg border border-slate-200 p-2 text-sm">
                <div className="font-medium">{g.name}</div>
                <div className="text-xs text-slate-500">{g.fighterIds.length} {t('categories.entries')}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> {t('categories.replaceExisting')}
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={assignTatamis} onChange={(e) => setAssignTatamis(e.target.checked)} /> {t('categories.autoTatami')}
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={genBrackets} onChange={(e) => setGenBrackets(e.target.checked)} /> {t('categories.genBracketsNow')}
            </label>
            <button className="btn-primary" disabled={apply.isPending} onClick={() => apply.mutate()}>{t('categories.applyGroups')}</button>
          </div>
        </div>
      )}

      {groupsByTatami.map((grp) => {
        const cats = (categories ?? []).filter((c) => c.tatamiId === grp.id && !c.isSpecial && c.entryCount > 0);
        if (cats.length === 0) return null;
        return (
          <div key={String(grp.id)} className="space-y-2">
            <div className="text-sm font-semibold uppercase tracking-wide text-slate-400">{grp.name}</div>
            {cats.map((c, i) => (
              <div key={c.id} className="card flex flex-wrap items-center gap-3 p-3">
                {grp.id != null && (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-white" title={t('categories.runningOrder')}>#{i + 1}</span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-800">{c.name}</div>
                  <div className="text-xs text-slate-500">
                    {c.gender ?? 'Open'} · {c.ageMin}-{c.ageMax}y · {c.weightMin}-{c.weightMax}kg · {c.entryCount} {t('categories.entries')}
                  </div>
                </div>
                <span className={`badge ${c.status === 'done' ? 'bg-emerald-100 text-emerald-700' : c.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{c.status}</span>
                <select className="input w-36 py-1.5 text-sm" value={c.tatamiId ?? ''} onChange={(e) => assign.mutate({ id: c.id, tatamiId: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">{t('categories.unassigned')}</option>
                  {(tatamis ?? []).map((tt) => (
                    <option key={tt.id} value={tt.id}>{tt.name}</option>
                  ))}
                </select>
                <select className="input w-28 py-1.5 text-sm" value={seedMode[c.id] ?? 'rank'} onChange={(e) => setSeedMode({ ...seedMode, [c.id]: e.target.value })}>
                  <option value="rank">{t('categories.seed.rank')}</option>
                  <option value="age">{t('categories.seed.age')}</option>
                  <option value="weight">{t('categories.seed.weight')}</option>
                  <option value="random">{t('categories.seed.random')}</option>
                  <option value="manual">{t('categories.seed.manual')}</option>
                </select>
                <button className="btn-ghost text-xs" disabled={c.entryCount < 2 || genBracket.isPending} onClick={() => genBracket.mutate({ id: c.id, mode: seedMode[c.id] ?? 'rank' })}>
                  {t('categories.generateBracket')}
                </button>
                <button className="btn-ghost text-xs" disabled={c.entryCount < 2 || simulate.isPending} onClick={() => simulate.mutate(c.id)} title={t('categories.simulate')}>▶</button>
                <button className="btn-ghost text-xs" onClick={() => setEditingCat(c.id)}>{t('categories.manage')}</button>
                <Link to={`/bracket/${c.id}`} className="btn-ghost text-xs">{t('categories.openBracket')}</Link>
              </div>
            ))}
          </div>
        );
      })}

      {(categories ?? []).some((c) => c.isSpecial) && (
        <div className="space-y-2">
          <div className="text-sm font-semibold uppercase tracking-wide text-purple-500">⚔ {t('categories.specialBouts')}</div>
          {(categories ?? []).filter((c) => c.isSpecial).map((c) => (
            <div key={c.id} className="card flex flex-wrap items-center gap-3 border-purple-200 p-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-800">{c.name}</div>
                <div className="text-xs text-slate-500">{c.entryCount} {t('categories.entries')}</div>
              </div>
              <span className={`badge ${c.status === 'done' ? 'bg-emerald-100 text-emerald-700' : 'bg-purple-100 text-purple-700'}`}>{c.status}</span>
              <select className="input w-36 py-1.5 text-sm" value={c.tatamiId ?? ''} onChange={(e) => assign.mutate({ id: c.id, tatamiId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">{t('categories.unassigned')}</option>
                {(tatamis ?? []).map((tt) => <option key={tt.id} value={tt.id}>{tt.name}</option>)}
              </select>
              <button className="btn-ghost text-xs" disabled={c.entryCount < 2 || genBracket.isPending} onClick={() => genBracket.mutate({ id: c.id, mode: 'manual' })}>{t('categories.generateBracket')}</button>
              <button className="btn-ghost text-xs" onClick={() => setEditingCat(c.id)}>{t('categories.manage')}</button>
              <Link to={`/bracket/${c.id}`} className="btn-ghost text-xs">{t('categories.openBracket')}</Link>
            </div>
          ))}
        </div>
      )}

      {(unassigned ?? []).length > 0 && (
        <div className="card border-amber-200 p-4">
          <div className="mb-1 text-sm font-semibold text-slate-700">👤 {t('categories.unassignedFighters')} · {unassigned!.length}</div>
          <div className="mb-2 text-xs text-slate-500">{t('categories.specialBoutsHelp')}</div>
          <div className="max-h-64 divide-y divide-slate-50 overflow-auto rounded-lg border border-slate-100">
            {unassigned!.map((f: any) => (
              <div key={f.id} className="flex flex-wrap items-center gap-2 px-2 py-1.5 text-sm hover:bg-slate-50">
                <input type="checkbox" checked={selected.includes(f.id)} onChange={() => toggleSel(f.id)} />
                <span className="font-medium text-slate-800">{f.firstName} {f.lastName}</span>
                <span className="text-xs text-slate-500">{f.gender ?? ''} · {f.age}y · {f.weight}kg · {f.rank?.name}</span>
                {f.reason && <span className="badge bg-amber-50 text-amber-700" title="Why unassigned">⚠ {f.reason}</span>}
                <select
                  className="input ml-auto w-64 py-1 text-xs"
                  value=""
                  onChange={(e) => e.target.value && addToCat.mutate({ catId: Number(e.target.value), fighterId: f.id })}
                >
                  <option value="">↳ {t('categories.addToCategory')}…</option>
                  {/* Only same-gender (or Open) groups — F vs M is allowed in special bouts only. */}
                  <optgroup label={t('categories.groups')}>
                    {(categories ?? []).filter((c) => !c.isSpecial && (!c.gender || !f.gender || c.gender === f.gender)).map((c) => (
                      <option key={c.id} value={c.id}>{c.name} · {c.entryCount} 👤</option>
                    ))}
                  </optgroup>
                  {(categories ?? []).some((c) => c.isSpecial) && (
                    <optgroup label={`⚔ ${t('categories.specialBouts')}`}>
                      {(categories ?? []).filter((c) => c.isSpecial).map((c) => (
                        <option key={c.id} value={c.id}>{c.name} · {c.entryCount} 👤</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-slate-500">{t('categories.selectHint')}</span>
            <select className="input ml-auto w-40 py-1.5 text-sm" value={boutTatami} onChange={(e) => setBoutTatami(e.target.value ? Number(e.target.value) : '')}>
              <option value="">{t('categories.unassigned')}</option>
              {(tatamis ?? []).map((tt) => (
                <option key={tt.id} value={tt.id}>{tt.name}</option>
              ))}
            </select>
            <button className="btn-primary" disabled={selected.length < 2 || createBout.isPending} onClick={() => createBout.mutate()}>
              {t('categories.createSpecialBout')} ({selected.length})
            </button>
          </div>
        </div>
      )}

      {(categories ?? []).length === 0 && (unassigned ?? []).length === 0 && (
        <div className="text-sm text-slate-400">No categories yet — use Auto-group or + New group.</div>
      )}

      {editingCat != null && <CategoryEditor categoryId={editingCat} onClose={() => { setEditingCat(null); invalidate(); }} />}
    </div>
  );
}
