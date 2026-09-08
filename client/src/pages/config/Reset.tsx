import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useEvent } from '../../lib/queries';
import { useI18n } from '../../i18n';

async function download(path: string, filename: string) {
  const res = await fetch(path, { credentials: 'include' });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Reset() {
  const { t } = useI18n();
  const { data: event } = useEvent();
  const [confirm, setConfirm] = useState('');

  const resetData = useMutation({
    mutationFn: () => api.post('/api/settings/reset/data', { confirm }),
    onSuccess: () => { alert('Event data reset.'); location.reload(); },
    onError: (e: any) => alert(e.message),
  });
  const resetFull = useMutation({
    mutationFn: () => api.post('/api/settings/reset/full', { confirm }),
    onSuccess: () => { alert('Full reset done.'); location.reload(); },
    onError: (e: any) => alert(e.message),
  });

  const match = confirm === event?.title;

  return (
    <div className="max-w-xl space-y-5">
      <h1 className="text-2xl font-bold text-slate-900">{t('reset.title')}</h1>

      <div className="card space-y-2 p-5">
        <div className="text-sm font-semibold text-slate-700">Backups</div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => download('/api/settings/archive', 'event-archive.json')}>{t('reset.archive')}</button>
          <button className="btn-ghost" onClick={() => download('/api/export/roster.xlsx', 'roster.xlsx')}>Roster .xlsx</button>
          <button className="btn-ghost" onClick={() => download('/api/export/results.xlsx', 'results.xlsx')}>Results .xlsx</button>
          <button className="btn-ghost" onClick={() => download('/api/export/medals.xlsx', 'medals.xlsx')}>Medals .xlsx</button>
        </div>
      </div>

      <div className="card space-y-3 border-red-200 p-5">
        <label className="label">{t('reset.typeToConfirm')} — "{event?.title}"</label>
        <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={event?.title} />

        <div className="rounded-lg border border-slate-200 p-3">
          <div className="font-semibold text-slate-800">{t('reset.dataTitle')}</div>
          <p className="mb-2 text-sm text-slate-500">{t('reset.dataDesc')}</p>
          <button className="btn-danger" disabled={!match || resetData.isPending} onClick={() => resetData.mutate()}>{t('reset.run')}</button>
        </div>

        <div className="rounded-lg border border-red-200 p-3">
          <div className="font-semibold text-red-700">{t('reset.fullTitle')}</div>
          <p className="mb-2 text-sm text-slate-500">{t('reset.fullDesc')}</p>
          <button className="btn-danger" disabled={!match || resetFull.isPending} onClick={() => confirm && resetFull.mutate()}>{t('reset.run')}</button>
        </div>
      </div>
    </div>
  );
}
