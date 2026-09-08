import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useTatamis } from '../../lib/queries';
import { useI18n } from '../../i18n';

interface UserRow {
  id: number;
  username: string;
  role: string;
  displayName: string | null;
  active: boolean;
  tatamiIds: number[];
}

export default function Users() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data: users } = useQuery<UserRow[]>({ queryKey: ['users'], queryFn: () => api.get('/api/users') });
  const { data: tatamis } = useTatamis();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] });

  const [form, setForm] = useState({ username: '', password: '', role: 'tatami_editor', displayName: '', tatamiIds: [] as number[] });

  const create = useMutation({
    mutationFn: () => api.post('/api/users', { ...form, displayName: form.displayName || null }),
    onSuccess: () => { setForm({ username: '', password: '', role: 'tatami_editor', displayName: '', tatamiIds: [] }); invalidate(); },
    onError: (e: any) => alert(e.message),
  });
  const update = useMutation({ mutationFn: ({ id, data }: { id: number; data: any }) => api.put(`/api/users/${id}`, data), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: number) => api.del(`/api/users/${id}`), onSuccess: invalidate, onError: (e: any) => alert(e.message) });

  const toggleTatami = (list: number[], id: number) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold text-slate-900">{t('users.title')}</h1>

      <div className="card grid grid-cols-2 gap-3 p-4 md:grid-cols-3">
        <input className="input" placeholder={t('login.username')} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <input className="input" placeholder={t('login.password')} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <input className="input" placeholder={t('users.displayName')} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
        <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="admin">admin</option>
          <option value="tatami_editor">arena_editor</option>
          <option value="viewer">viewer</option>
        </select>
        <div className="col-span-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase text-slate-400">{t('users.tatamis')}:</span>
          {(tatamis ?? []).map((tt) => (
            <label key={tt.id} className="badge cursor-pointer bg-slate-100">
              <input type="checkbox" className="mr-1" checked={form.tatamiIds.includes(tt.id)} onChange={() => setForm({ ...form, tatamiIds: toggleTatami(form.tatamiIds, tt.id) })} />
              {tt.name}
            </label>
          ))}
        </div>
        <button className="btn-primary col-span-2 md:col-span-3" disabled={!form.username || !form.password} onClick={() => create.mutate()}>
          {t('users.add')}
        </button>
      </div>

      <div className="space-y-2">
        {(users ?? []).map((u) => (
          <div key={u.id} className="card flex flex-wrap items-center gap-3 p-3">
            <span className="font-semibold text-slate-800">{u.username}</span>
            <span className="badge bg-slate-100 text-slate-600">{u.role === 'tatami_editor' ? 'arena_editor' : u.role}</span>
            <label className="flex items-center gap-1 text-sm text-slate-600">
              <input type="checkbox" checked={u.active} onChange={(e) => update.mutate({ id: u.id, data: { active: e.target.checked } })} />
              {t('users.active')}
            </label>
            {u.role === 'tatami_editor' && (
              <div className="flex flex-wrap gap-1">
                {(tatamis ?? []).map((tt) => (
                  <label key={tt.id} className="badge cursor-pointer bg-slate-50 text-xs">
                    <input type="checkbox" className="mr-1" checked={u.tatamiIds.includes(tt.id)} onChange={() => update.mutate({ id: u.id, data: { tatamiIds: toggleTatami(u.tatamiIds, tt.id) } })} />
                    {tt.name}
                  </label>
                ))}
              </div>
            )}
            <button
              className="btn-ghost ml-auto text-xs"
              onClick={() => {
                const pw = prompt('New password');
                if (pw) update.mutate({ id: u.id, data: { password: pw } });
              }}
            >
              🔑
            </button>
            <button className="btn-danger text-xs" onClick={() => confirm('Delete user?') && remove.mutate(u.id)}>
              {t('common.delete')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
