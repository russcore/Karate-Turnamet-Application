import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useEvent } from '../../lib/queries';
import { useI18n } from '../../i18n';

export default function Branding() {
  const { t } = useI18n();
  const { data: event } = useEvent();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: '',
    subtitle: '',
    arenaTerm: '',
    accentColor: '#e11d48',
    topBarColor: '#0b1220',
    bronzeMode: 'single' as 'single' | 'double',
    cornerAName: 'AO',
    cornerAColor: '#2563eb',
    cornerBName: 'AKA',
    cornerBColor: '#dc2626',
  });

  useEffect(() => {
    if (event)
      setForm({
        title: event.title,
        subtitle: event.subtitle ?? '',
        arenaTerm: event.arenaTerm ?? '',
        accentColor: event.accentColor,
        topBarColor: event.topBarColor ?? '#0b1220',
        bronzeMode: event.bronzeMode,
        cornerAName: event.cornerAName,
        cornerAColor: event.cornerAColor,
        cornerBName: event.cornerBName,
        cornerBColor: event.cornerBColor,
      });
  }, [event]);

  const save = useMutation({
    mutationFn: () => api.put('/api/event', { ...form, arenaTerm: form.arenaTerm.trim() || null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['event'] }),
  });

  const uploadLogo = useMutation({
    mutationFn: (file: File) => api.upload('/api/event/logo', file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['event'] }),
  });
  const uploadTatamiImg = useMutation({
    mutationFn: (file: File) => api.upload('/api/event/tatami-default-image', file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['event'] }),
  });

  return (
    <div className="max-w-xl space-y-5">
      <h1 className="text-2xl font-bold text-slate-900">{t('branding.title')}</h1>

      <div className="card space-y-4 p-5">
        <div>
          <label className="label">{t('branding.eventTitle')}</label>
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div>
          <label className="label">{t('branding.subtitle')}</label>
          <input className="input" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
        </div>
        <div>
          <label className="label">{t('branding.arenaTerm')}</label>
          <input className="input" placeholder="Arena / Tatami / Ring / Mat…" value={form.arenaTerm} onChange={(e) => setForm({ ...form, arenaTerm: e.target.value })} />
          <div className="mt-0.5 text-[11px] text-slate-400">{t('branding.arenaTermHint')}</div>
        </div>
        <div className="flex items-center gap-4">
          <div>
            <label className="label">{t('branding.accent')}</label>
            <input type="color" className="h-10 w-16 rounded border border-slate-300" value={form.accentColor} onChange={(e) => setForm({ ...form, accentColor: e.target.value })} />
          </div>
          <div>
            <label className="label">{t('branding.topBarColor')}</label>
            <input type="color" className="h-10 w-16 rounded border border-slate-300" value={form.topBarColor} onChange={(e) => setForm({ ...form, topBarColor: e.target.value })} />
          </div>
          <div className="flex-1">
            <label className="label">{t('branding.bronzeMode')}</label>
            <select className="input" value={form.bronzeMode} onChange={(e) => setForm({ ...form, bronzeMode: e.target.value as any })}>
              <option value="single">{t('branding.bronzeSingle')}</option>
              <option value="double">{t('branding.bronzeDouble')}</option>
            </select>
          </div>
        </div>
        {/* Live preview of the top bar with the chosen colour + logo + title. */}
        <div>
          <label className="label">{t('branding.preview')}</label>
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-2" style={{ background: form.topBarColor }}>
            <img src={event?.logoPath || '/canva-logo.png'} alt="logo" className="h-8 w-8 rounded object-contain ring-1 ring-white/15" />
            <div className="flex-1 text-center leading-tight">
              <div className="text-sm font-bold text-white">{form.title || t('app.title')}</div>
              {form.subtitle && <div className="text-[11px] text-slate-300">{form.subtitle}</div>}
            </div>
            <div className="h-8 w-8 shrink-0" aria-hidden="true" />
          </div>
        </div>
        <button className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
          {t('common.save')}
        </button>
      </div>

      <div className="card space-y-3 p-5">
        <div className="text-sm font-semibold text-slate-700">{t('branding.corners')}</div>
        <p className="text-xs text-slate-500">{t('branding.cornersHelp')}</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('branding.leftCorner')}</label>
            <div className="flex gap-2">
              <input type="color" className="h-10 w-12 rounded border" value={form.cornerAColor} onChange={(e) => setForm({ ...form, cornerAColor: e.target.value })} />
              <input className="input" value={form.cornerAName} onChange={(e) => setForm({ ...form, cornerAName: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">{t('branding.rightCorner')}</label>
            <div className="flex gap-2">
              <input type="color" className="h-10 w-12 rounded border" value={form.cornerBColor} onChange={(e) => setForm({ ...form, cornerBColor: e.target.value })} />
              <input className="input" value={form.cornerBName} onChange={(e) => setForm({ ...form, cornerBName: e.target.value })} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="rounded px-1.5 py-0.5 text-xs font-bold text-white" style={{ background: form.cornerAColor }}>{form.cornerAName}</span>
          <span className="text-slate-400">vs</span>
          <span className="rounded px-1.5 py-0.5 text-xs font-bold text-white" style={{ background: form.cornerBColor }}>{form.cornerBName}</span>
        </div>
        <button className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>{t('common.save')}</button>
      </div>

      <div className="card space-y-4 p-5">
        <div>
          <label className="label">{t('branding.logo')}</label>
          <div className="flex items-center gap-3">
            {event?.logoPath && <img src={event.logoPath} className="h-12 w-12 rounded border object-contain" />}
            <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadLogo.mutate(e.target.files[0])} />
          </div>
        </div>
        <div>
          <label className="label">{t('branding.defaultTatamiImage')}</label>
          <div className="flex items-center gap-3">
            {event?.defaultTatamiImage && <img src={event.defaultTatamiImage} className="h-12 w-20 rounded border object-cover" />}
            <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadTatamiImg.mutate(e.target.files[0])} />
          </div>
        </div>
      </div>
    </div>
  );
}
