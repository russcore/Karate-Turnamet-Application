import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useI18n } from '../../i18n';

interface AiSettings {
  provider: 'local' | 'claude' | 'openai' | 'gemini';
  model: string;
  ageBand: number;
  weightBand: number;
  rankBand: number;
  avoidSameSchool: boolean;
  maxGroupSize: number;
  minGroupSize: number;
  hasApiKey: boolean;
}

export default function Settings() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data } = useQuery<AiSettings>({ queryKey: ['ai'], queryFn: () => api.get('/api/settings/ai') });
  const [form, setForm] = useState<Partial<AiSettings> & { apiKey?: string }>({});

  useEffect(() => { if (data) setForm({ ...data, apiKey: '' }); }, [data]);

  const save = useMutation({
    mutationFn: () => {
      const body: any = { ...form };
      if (!body.apiKey) delete body.apiKey; // only send a new key when typed
      delete body.hasApiKey;
      return api.put('/api/settings/ai', body);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai'] }),
  });

  const set = (patch: Partial<AiSettings> & { apiKey?: string }) => setForm({ ...form, ...patch });
  const external = form.provider && form.provider !== 'local';

  return (
    <div className="max-w-xl space-y-5">
      <h1 className="text-2xl font-bold text-slate-900">{t('settings.title')}</h1>

      <div className="card space-y-4 p-5">
        <div>
          <label className="label">{t('settings.provider')}</label>
          <select className="input" value={form.provider ?? 'local'} onChange={(e) => set({ provider: e.target.value as any })}>
            <option value="local">{t('settings.local')}</option>
            <option value="claude">Claude (Anthropic)</option>
            <option value="openai">OpenAI</option>
            <option value="gemini">Google Gemini</option>
          </select>
        </div>

        {external && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t('settings.apiKey')}</label>
              <input className="input" type="password" placeholder={data?.hasApiKey ? '•••• ' + t('settings.keySet') : ''} value={form.apiKey ?? ''} onChange={(e) => set({ apiKey: e.target.value })} />
            </div>
            <div>
              <label className="label">{t('settings.model')}</label>
              <input className="input" value={form.model ?? ''} onChange={(e) => set({ model: e.target.value })} placeholder="e.g. gpt-4o-mini" />
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">{t('settings.ageBand')}</label>
            <input className="input" type="number" value={form.ageBand ?? 3} onChange={(e) => set({ ageBand: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">{t('settings.weightBand')}</label>
            <input className="input" type="number" value={form.weightBand ?? 5} onChange={(e) => set({ weightBand: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">{t('settings.rankBand')}</label>
            <input className="input" type="number" value={form.rankBand ?? 2} onChange={(e) => set({ rankBand: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">{t('settings.minGroup')}</label>
            <input className="input" type="number" min={2} max={8} value={form.minGroupSize ?? 2} onChange={(e) => set({ minGroupSize: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">{t('settings.maxGroup')}</label>
            <input className="input" type="number" min={2} max={8} value={form.maxGroupSize ?? 8} onChange={(e) => set({ maxGroupSize: Number(e.target.value) })} />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.avoidSameSchool ?? true} onChange={(e) => set({ avoidSameSchool: e.target.checked })} />
          {t('settings.avoidSameSchool')}
        </label>

        <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
          {t('common.save')}
        </button>
        {save.isSuccess && <span className="ml-3 text-sm text-emerald-600">✓</span>}
      </div>
    </div>
  );
}
