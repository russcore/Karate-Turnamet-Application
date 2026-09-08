import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { ensureAudio, playAlarm } from '../lib/alarm';

const PRESETS = [60, 90, 105, 110, 120, 150, 180];
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Per-bout countdown timer with its own configurable duration. Flashes + alarms at 0. */
export default function BoutTimer({ durationSec, compact, onFinish }: { durationSec: number; compact?: boolean; onFinish?: () => void }) {
  const { t } = useI18n();
  const [dur, setDur] = useState(durationSec);
  const [remaining, setRemaining] = useState(durationSec);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const remRef = useRef(remaining);
  remRef.current = remaining;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  // Fire the time-up callback once, when the countdown reaches zero.
  useEffect(() => { if (done) onFinishRef.current?.(); }, [done]);

  // Follow the group default until the referee changes this bout's own duration.
  useEffect(() => { setDur(durationSec); }, [durationSec]);
  useEffect(() => { setRemaining(dur); setDone(false); setRunning(false); }, [dur]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) { clearInterval(id); setRunning(false); setDone(true); playAlarm(); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const start = () => {
    ensureAudio();
    if (done) { setRemaining(dur); setDone(false); }
    setRunning(true);
  };
  const reset = () => { setRunning(false); setDone(false); setRemaining(dur); };
  const idle = !running && !done && remaining === dur;
  const presets = [...new Set([...PRESETS, dur])].sort((a, b) => a - b);

  if (compact) {
    return (
      <div className={`mt-2 flex items-center justify-center gap-2 rounded-lg border px-2 py-1 ${done ? 'animate-pulse border-red-500 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
        <span className="text-[10px] font-semibold uppercase text-slate-400">⏱</span>
        {idle ? (
          <select className="bg-transparent font-mono text-base font-bold text-slate-700 outline-none" value={dur} onChange={(e) => setDur(Number(e.target.value))}>
            {presets.map((s) => <option key={s} value={s}>{fmt(s)}</option>)}
          </select>
        ) : (
          <span className={`font-mono text-base font-bold tabular-nums ${done ? 'text-red-600' : remaining <= 10 && running ? 'text-amber-600' : 'text-slate-700'}`}>
            {done ? t('timer.timeUp') : fmt(remaining)}
          </span>
        )}
        {!running ? (
          <button className="text-sm text-emerald-600" onClick={start} title={t('timer.start')}>▶</button>
        ) : (
          <button className="text-sm text-slate-500" onClick={() => setRunning(false)} title={t('timer.pause')}>⏸</button>
        )}
        <button className="text-sm text-slate-400" onClick={reset} title={t('timer.reset')}>↺</button>
      </div>
    );
  }

  return (
    <div className={`card flex items-center gap-3 p-3 ${done ? 'animate-pulse border-2 border-red-500 bg-red-50' : ''}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('timer.title')}</span>
      {idle ? (
        <select className="bg-transparent font-mono text-3xl font-bold text-slate-900 outline-none" value={dur} onChange={(e) => setDur(Number(e.target.value))}>
          {presets.map((s) => <option key={s} value={s}>{fmt(s)}</option>)}
        </select>
      ) : (
        <span className={`font-mono text-3xl font-bold tabular-nums ${done ? 'text-red-600' : remaining <= 10 && running ? 'text-amber-600' : 'text-slate-900'}`}>
          {done ? t('timer.timeUp') : fmt(remaining)}
        </span>
      )}
      <div className="ml-auto flex gap-2">
        {!running ? <button className="btn-primary text-xs" onClick={start}>▶ {t('timer.start')}</button> : <button className="btn-ghost text-xs" onClick={() => setRunning(false)}>⏸ {t('timer.pause')}</button>}
        <button className="btn-ghost text-xs" onClick={reset}>↺ {t('timer.reset')}</button>
      </div>
    </div>
  );
}
