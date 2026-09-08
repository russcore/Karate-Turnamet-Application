import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useRanks } from '../lib/queries';
import { useI18n } from '../i18n';
import RankChip from '../components/RankChip';

interface FighterRow {
  id: number;
  firstName: string;
  lastName: string;
  school: string | null;
  rankId: number;
  age: number;
  weight: number;
  gender: string | null;
  city: string | null;
  country: string | null;
  rank: { name: string; beltColor: string; stripeColor: string | null; stripeCount: number };
  categoryId: number | null;
  categoryName: string | null;
  tatamiName: string | null;
}

type SortKey = 'name' | 'age' | 'weight' | 'gender' | 'rank';
type GroupKey = 'none' | 'gender' | 'ageBand';

export default function Fighters() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data: ranks } = useRanks();
  const [q, setQ] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [asc, setAsc] = useState(true);
  const [groupBy, setGroupBy] = useState<GroupKey>('none');
  const [edit, setEdit] = useState<FighterRow | null>(null);
  const { data } = useQuery<FighterRow[]>({ queryKey: ['fighters', q], queryFn: () => api.get('/api/fighters?q=' + encodeURIComponent(q)) });
  const { data: cats } = useQuery<any[]>({ queryKey: ['categories'], queryFn: () => api.get('/api/categories') });
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['fighters'] }); qc.invalidateQueries({ queryKey: ['unassigned'] }); qc.invalidateQueries({ queryKey: ['categories'] }); };
  const reassign = useMutation({
    mutationFn: async ({ fighterId, oldCat, newCat }: { fighterId: number; oldCat: number | null; newCat: number | null }) => {
      if (oldCat) await api.del(`/api/categories/${oldCat}/entries/${fighterId}`);
      if (newCat) await api.post(`/api/categories/${newCat}/entries`, { fighterId });
    },
    onSuccess: (_r, v) => { invalidate(); setEdit((e) => (e ? { ...e, categoryId: v.newCat, tatamiName: (cats ?? []).find((c) => c.id === v.newCat)?.tatami?.name ?? null, categoryName: (cats ?? []).find((c) => c.id === v.newCat)?.name ?? null } : e)); },
    onError: (e: any) => alert(e.message),
  });
  const remove = useMutation({ mutationFn: (id: number) => api.del('/api/fighters/' + id), onSuccess: invalidate });
  const save = useMutation({
    mutationFn: (f: FighterRow) => api.put('/api/fighters/' + f.id, {
      firstName: f.firstName, lastName: f.lastName, school: f.school || null,
      rankId: Number(f.rankId), age: Number(f.age), weight: Number(f.weight), gender: f.gender || null,
      city: f.city || null, country: f.country || null,
    }),
    onSuccess: () => { setEdit(null); invalidate(); },
    onError: (e: any) => alert(e.message),
  });

  const sorted = useMemo(() => {
    const arr = [...(data ?? [])];
    const dir = asc ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortBy) {
        case 'age': return (a.age - b.age) * dir;
        case 'weight': return (a.weight - b.weight) * dir;
        case 'gender': return String(a.gender ?? '').localeCompare(String(b.gender ?? '')) * dir;
        case 'rank': return (a.rank?.name ?? '').localeCompare(b.rank?.name ?? '') * dir;
        default: return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`) * dir;
      }
    });
    return arr;
  }, [data, sortBy, asc]);

  const groups = useMemo(() => {
    if (groupBy === 'none') return [{ label: '', rows: sorted }];
    const map = new Map<string, FighterRow[]>();
    for (const f of sorted) {
      const key = groupBy === 'gender' ? (f.gender === 'M' ? 'Male' : f.gender === 'F' ? 'Female' : 'Open') : `${Math.floor(f.age / 3) * 3}–${Math.floor(f.age / 3) * 3 + 2} yrs`;
      (map.get(key) ?? map.set(key, []).get(key)!).push(f);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, rows]) => ({ label, rows }));
  }, [sorted, groupBy]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{t('fighters.title')}</h1>
        <span className="text-sm text-slate-500">{data?.length ?? 0}</span>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-3">
        <input className="input max-w-xs flex-1" placeholder={t('fighters.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <div>
          <label className="label">{t('fighters.sortBy')}</label>
          <div className="flex gap-1">
            <select className="input py-1.5" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)}>
              <option value="name">{t('common.name')}</option>
              <option value="age">{t('fighters.age')}</option>
              <option value="weight">{t('fighters.weight')}</option>
              <option value="gender">{t('fighters.gender')}</option>
              <option value="rank">{t('fighters.rank')}</option>
            </select>
            <button className="btn-ghost" onClick={() => setAsc((v) => !v)}>{asc ? '↑' : '↓'}</button>
          </div>
        </div>
        <div>
          <label className="label">{t('fighters.groupBy')}</label>
          <select className="input py-1.5" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupKey)}>
            <option value="none">{t('fighters.none')}</option>
            <option value="gender">{t('fighters.gender')}</option>
            <option value="ageBand">{t('fighters.age')}</option>
          </select>
        </div>
      </div>

      {groups.map((g) => (
        <div key={g.label} className="card overflow-hidden">
          {g.label && <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">{g.label} · {g.rows.length}</div>}
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">{t('common.name')}</th>
                <th className="px-3 py-2">{t('fighters.school')}</th>
                <th className="px-3 py-2">{t('fighters.rank')}</th>
                <th className="px-3 py-2">{t('fighters.age')}</th>
                <th className="px-3 py-2">{t('fighters.weight')}</th>
                <th className="px-3 py-2">{t('fighters.gender')}</th>
                <th className="px-3 py-2">{t('fighters.location')}</th>
                <th className="px-3 py-2">{t('nav.categories')}</th>
                <th className="px-3 py-2">{t('nav.tatami')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {g.rows.slice(0, 500).map((f) => (
                <tr key={f.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-800">{f.firstName} {f.lastName}</td>
                  <td className="px-3 py-2 text-slate-500">{f.school}</td>
                  <td className="px-3 py-2"><RankChip name={f.rank?.name} color={f.rank?.beltColor} stripeColor={f.rank?.stripeColor} stripeCount={f.rank?.stripeCount} /></td>
                  <td className="px-3 py-2">{f.age}</td>
                  <td className="px-3 py-2">{f.weight}kg</td>
                  <td className="px-3 py-2">{f.gender}</td>
                  <td className="px-3 py-2 text-slate-500">{[f.city, f.country].filter(Boolean).join(', ') || <span className="text-slate-300">—</span>}</td>
                  <td className="px-3 py-2">{f.categoryName ? <span className="badge bg-slate-100 text-slate-600">{f.categoryName}</span> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-3 py-2">{f.tatamiName ? <span className="badge bg-blue-50 text-blue-700">{f.tatamiName}</span> : <span className="text-slate-300">—</span>}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button className="mr-3 text-xs text-slate-600 hover:underline" onClick={() => setEdit({ ...f })}>{t('common.edit')}</button>
                    <button className="text-xs text-red-500 hover:underline" onClick={() => remove.mutate(f.id)}>{t('common.delete')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEdit(null)}>
          <div className="card w-full max-w-md space-y-3 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-bold text-slate-900">{t('common.edit')}: {edit.firstName} {edit.lastName}</div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">First</label><input className="input" value={edit.firstName} onChange={(e) => setEdit({ ...edit, firstName: e.target.value })} /></div>
              <div><label className="label">Last</label><input className="input" value={edit.lastName} onChange={(e) => setEdit({ ...edit, lastName: e.target.value })} /></div>
              <div className="col-span-2"><label className="label">{t('fighters.school')}</label><input className="input" value={edit.school ?? ''} onChange={(e) => setEdit({ ...edit, school: e.target.value })} /></div>
              <div><label className="label">{t('fighters.rank')}</label>
                <select className="input py-1.5" value={edit.rankId} onChange={(e) => setEdit({ ...edit, rankId: Number(e.target.value) })}>
                  {(ranks ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div><label className="label">{t('fighters.gender')}</label>
                <select className="input py-1.5" value={edit.gender ?? ''} onChange={(e) => setEdit({ ...edit, gender: e.target.value || null })}>
                  <option value="">—</option><option value="M">M</option><option value="F">F</option>
                </select>
              </div>
              <div><label className="label">{t('fighters.age')}</label><input type="number" className="input" value={edit.age} onChange={(e) => setEdit({ ...edit, age: Number(e.target.value) })} /></div>
              <div><label className="label">{t('fighters.weight')} (kg)</label><input type="number" className="input" value={edit.weight} onChange={(e) => setEdit({ ...edit, weight: Number(e.target.value) })} /></div>
              <div><label className="label">{t('fighters.city')}</label><input className="input" value={edit.city ?? ''} onChange={(e) => setEdit({ ...edit, city: e.target.value })} /></div>
              <div><label className="label">{t('fighters.country')}</label><input className="input" value={edit.country ?? ''} onChange={(e) => setEdit({ ...edit, country: e.target.value })} /></div>
              <div className="col-span-2">
                <label className="label">{t('nav.categories')} / {t('nav.tatami')}</label>
                <select
                  className="input py-1.5"
                  value={edit.categoryId ?? ''}
                  onChange={(e) => reassign.mutate({ fighterId: edit.id, oldCat: edit.categoryId, newCat: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">— {t('categories.unassignedFighters')} —</option>
                  {(cats ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.tatami ? ` · ${c.tatami.name}` : ''}</option>
                  ))}
                </select>
                {edit.tatamiName && <div className="mt-1 text-xs text-slate-500">→ {edit.tatamiName}</div>}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setEdit(null)}>{t('common.cancel')}</button>
              <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate(edit)}>{t('common.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
