import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useRanks } from '../lib/queries';
import { useI18n } from '../i18n';

const FIELDS = ['first_name', 'last_name', 'school', 'teacher_name', 'teacher_rank', 'rank', 'age', 'weight', 'gender', 'city', 'country', 'notes'];
const REQUIRED = ['first_name', 'last_name', 'rank', 'age', 'weight'];

async function downloadTemplate(format: 'xlsx' | 'csv') {
  const res = await fetch('/api/import/template?format=' + format, { credentials: 'include' });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'roster-template.' + format;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Import() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data: ranks } = useRanks();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [parsed, setParsed] = useState<{ filename: string; columns: string[]; rows: any[] } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [rankMappings, setRankMappings] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<any>(null);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File) => {
    setBusy(true);
    try {
      const res = await api.upload('/api/import/parse', file);
      setParsed(res);
      setMapping(res.suggestedMapping);
      setStep(2);
    } finally {
      setBusy(false);
    }
  };

  const runPreview = async (rm = rankMappings) => {
    setBusy(true);
    try {
      const res = await api.post('/api/import/preview', { rows: parsed!.rows, mapping, rankMappings: rm });
      setPreview(res);
      setStep(3);
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    setBusy(true);
    try {
      const res = await api.post('/api/import/commit', { filename: parsed!.filename, rows: preview.rows });
      setResult(res);
      qc.invalidateQueries({ queryKey: ['fighters'] });
      setStep(4);
    } finally {
      setBusy(false);
    }
  };

  const Steps = () => (
    <div className="mb-4 flex gap-2 text-xs">
      {['upload', 'map', 'preview', 'done'].map((s, i) => (
        <div key={s} className={`badge ${step === i + 1 ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`}>
          {i + 1}. {t('import.step.' + s)}
        </div>
      ))}
    </div>
  );

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">{t('import.title')}</h1>
      <Steps />

      {step === 1 && (
        <div className="card space-y-4 p-6">
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => downloadTemplate('xlsx')}>{t('import.downloadTemplate')} · {t('import.xlsx')}</button>
            <button className="btn-ghost" onClick={() => downloadTemplate('csv')}>{t('import.downloadTemplate')} · {t('import.csv')}</button>
          </div>
          <label className="flex h-32 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-slate-400">
            {busy ? t('common.loading') : t('import.chooseFile')}
            <input type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
        </div>
      )}

      {step === 2 && parsed && (
        <div className="card space-y-3 p-5">
          <div className="text-sm font-semibold">{t('import.mapColumns')}</div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {FIELDS.map((f) => (
              <div key={f}>
                <label className="label">{f}{REQUIRED.includes(f) && <span className="text-red-500"> *</span>}</label>
                <select className="input" value={mapping[f] ?? ''} onChange={(e) => setMapping({ ...mapping, [f]: e.target.value })}>
                  <option value="">—</option>
                  {parsed.columns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <button className="btn-primary" disabled={busy} onClick={() => runPreview()}>{t('import.preview')} →</button>
        </div>
      )}

      {step === 3 && preview && (
        <div className="space-y-4">
          {preview.unknownRanks.length > 0 && (
            <div className="card space-y-2 p-4">
              <div className="text-sm font-semibold text-amber-700">{t('import.unknownRanks')}</div>
              {preview.unknownRanks.map((rv: string) => (
                <div key={rv} className="flex items-center gap-2">
                  <span className="w-40 truncate text-sm">{rv}</span>
                  <select
                    className="input w-56 py-1.5 text-sm"
                    value={rankMappings[rv] ?? ''}
                    onChange={(e) => setRankMappings({ ...rankMappings, [rv]: Number(e.target.value) })}
                  >
                    <option value="">—</option>
                    {(ranks ?? []).map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              ))}
              <button className="btn-ghost text-xs" onClick={() => runPreview(rankMappings)}>Re-check</button>
            </div>
          )}

          <div className="card p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span>
                <span className="font-semibold text-emerald-600">{preview.okCount}</span> ok ·{' '}
                <span className="font-semibold text-red-600">{preview.errorCount}</span> {t('import.errors')}
              </span>
              <button className="btn-primary" disabled={busy || preview.okCount === 0} onClick={commit}>{t('import.commit')}</button>
            </div>
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-2 py-1">{t('import.row')}</th>
                    <th className="px-2 py-1">{t('common.name')}</th>
                    <th className="px-2 py-1">{t('fighters.rank')}</th>
                    <th className="px-2 py-1">{t('import.errors')} / {t('import.warnings')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r: any) => (
                    <tr key={r.index} className={`border-t border-slate-100 ${r.errors.length ? 'bg-red-50' : ''}`}>
                      <td className="px-2 py-1 text-slate-400">{r.index}</td>
                      <td className="px-2 py-1">{r.firstName} {r.lastName}</td>
                      <td className="px-2 py-1">{r.rankRaw}{r.rankId ? '' : ' ⚠'}</td>
                      <td className="px-2 py-1 text-xs">
                        {r.errors.map((e: string) => <span key={e} className="mr-2 text-red-600">{e}</span>)}
                        {r.warnings.map((w: string) => <span key={w} className="mr-2 text-amber-600">{w}</span>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {step === 4 && result && (
        <div className="card p-6 text-center">
          <div className="text-lg font-semibold text-emerald-600">✓ {t('import.result', { ok: result.imported, skipped: result.skipped })}</div>
          <button className="btn-ghost mt-4" onClick={() => { setStep(1); setParsed(null); setPreview(null); setResult(null); }}>{t('common.back')}</button>
        </div>
      )}
    </div>
  );
}
