import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useTatamis } from '../../lib/queries';
import { useArenaTerm } from '../../lib/useArenaTerm';
import { useI18n } from '../../i18n';

export default function TatamiSetup() {
  const { t } = useI18n();
  const term = useArenaTerm();
  const { data: tatamis } = useTatamis();
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const invalidate = () => qc.invalidateQueries({ queryKey: ['tatami'] });

  const add = useMutation({ mutationFn: () => api.post('/api/tatami', { name: newName }), onSuccess: () => { setNewName(''); invalidate(); } });
  const update = useMutation({ mutationFn: ({ id, data }: { id: number; data: any }) => api.put(`/api/tatami/${id}`, data), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: number) => api.del(`/api/tatami/${id}`), onSuccess: invalidate });
  const uploadImg = useMutation({ mutationFn: ({ id, file }: { id: number; file: File }) => api.upload(`/api/tatami/${id}/image`, file), onSuccess: invalidate });

  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold text-slate-900">{term}</h1>

      <div className="card p-4">
        <div className="flex gap-2">
          <input className="input" placeholder={t('common.name')} value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button className="btn-primary shrink-0" disabled={!newName || add.isPending} onClick={() => add.mutate()}>
            {t('tatami.add')}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {(tatamis ?? []).map((tt) => (
          <div key={tt.id} className="card flex items-center gap-3 p-3">
            {tt.imagePath ? <img src={tt.imagePath} className="h-12 w-16 rounded object-cover" /> : <div className="flex h-12 w-16 items-center justify-center rounded bg-slate-100 text-xl">🥋</div>}
            <input
              className="input flex-1"
              defaultValue={tt.name}
              onBlur={(e) => e.target.value !== tt.name && update.mutate({ id: tt.id, data: { name: e.target.value } })}
            />
            <label className="flex items-center gap-1 text-sm text-slate-600">
              <input type="checkbox" checked={tt.enabled} onChange={(e) => update.mutate({ id: tt.id, data: { enabled: e.target.checked } })} />
              {t('tatami.enabled')}
            </label>
            <label className="btn-ghost cursor-pointer text-xs">
              {t('tatami.image')}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadImg.mutate({ id: tt.id, file: e.target.files[0] })} />
            </label>
            <button className="btn-danger text-xs" onClick={() => remove.mutate(tt.id)}>
              {t('common.delete')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
