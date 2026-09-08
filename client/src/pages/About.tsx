import { useEvent } from '../lib/queries';
import { useI18n } from '../i18n';

export const APP_VERSION = '1.0.0';

export default function About() {
  const { t } = useI18n();
  const { data: event } = useEvent();

  const features: { icon: string; key: string }[] = [
    { icon: '🤖', key: 'about.f.grouping' },
    { icon: '🏆', key: 'about.f.brackets' },
    { icon: '📡', key: 'about.f.live' },
    { icon: '⏱', key: 'about.f.timers' },
    { icon: '🥇', key: 'about.f.podium' },
    { icon: '🌐', key: 'about.f.i18n' },
    { icon: '🔐', key: 'about.f.roles' },
    { icon: '📥', key: 'about.f.import' },
  ];

  const tech = ['Fastify 5', 'React + Vite', 'Prisma + SQLite', 'WebSocket', 'TailwindCSS', 'TanStack Query'];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Hero */}
      <div className="card overflow-hidden p-0">
        <div className="flex items-center gap-4 p-6" style={{ background: 'linear-gradient(135deg, var(--sidebar-2), var(--sidebar))' }}>
          <img src={event?.logoPath || '/canva-logo.png'} alt="logo" className="h-16 w-16 rounded-2xl object-contain ring-1 ring-white/20" />
          <div>
            <h1 className="text-2xl font-bold text-white">{event?.title ?? t('app.title')}</h1>
            <div className="mt-1 flex items-center gap-2">
              <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold text-white">v{APP_VERSION}</span>
              <span className="text-xs text-slate-300">{t('about.subtitle')}</span>
            </div>
          </div>
        </div>
        <p className="p-6 text-sm leading-relaxed text-slate-600">{t('about.tagline')}</p>
      </div>

      {/* Tip */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        💡 <span className="font-semibold">{t('about.tipTitle')}:</span> {t('about.tip')}
      </div>

      {/* Features */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">{t('about.whatItDoes')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {features.map((f) => (
            <div key={f.key} className="card flex items-start gap-3 p-3">
              <span className="text-xl">{f.icon}</span>
              <span className="text-sm text-slate-700">{t(f.key)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tech */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">{t('about.builtWith')}</h2>
        <div className="flex flex-wrap gap-2">
          {tech.map((x) => (
            <span key={x} className="badge bg-slate-100 px-3 py-1 text-sm text-slate-600">{x}</span>
          ))}
        </div>
      </div>

      {/* Manual + license */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card p-4">
          <div className="text-sm font-semibold text-slate-700">📖 {t('about.manual')}</div>
          <p className="mt-1 text-xs text-slate-500">{t('about.manualHint')}</p>
        </div>
        <div className="card p-4">
          <div className="text-sm font-semibold text-slate-700">⚖ {t('about.license')}</div>
          <p className="mt-1 text-xs text-slate-500">© {new Date().getFullYear()} Victor Prusakov · {t('about.licenseHint')}</p>
        </div>
      </div>

      <div className="pt-2 text-center text-xs text-slate-400">{t('about.credits')}</div>
    </div>
  );
}
