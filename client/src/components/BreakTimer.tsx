import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { ensureAudio, playAlarm } from '../lib/alarm';

// Break between fights on a tatami — capped at 5 minutes.
const MAX = 300;
const PRESETS = [60, 120, 180, 240, 300];
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** A tatami-wide "break before the next fight" countdown (max 5 min), with an alarm at 0. */
export default function BreakTimer() {
  const { t } = useI18n();
  const [dur, setDur] = useState(120);
  const [remaining, setRemaining] = useState(120);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const remRef = useRef(remaining);
  remRef.current = remaining;

  useEffect(() => { setRemaining(dur); setDone(false); setRunning(false); }, [dur]);

  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) { clearInterval(iv); setRunning(false); setDone(true); playAlarm(); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [running]);

  const start = () => { ensureAudio(); if (done) { setRemaining(dur); setDone(false); } setRunning(true); };
  const reset = () => { setRunning(false); setDone(false); setRemaining(dur); };
  const idle = !running && !done && remaining === dur;

  return (
    <div className={`card flex flex-wrap items-center gap-3 p-3 ${done ? 'animate-pulse border-2 border-amber-500 bg-amber-50' : ''}`}>
      <span className="text-lg">☕</span>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('break.title')}</span>
      {idle ? (
        <select className="bg-transparent font-mono text-2xl font-bold text-slate-900 outline-none" value={dur} onChange={(e) => setDur(Math.min(MAX, Number(e.target.value)))}>
          {PRESETS.map((s) => <option key={s} value={s}>{fmt(s)}</option>)}
        </select>
      ) : (
        <span className={`font-mono text-2xl font-bold tabular-nums ${done ? 'text-amber-600' : remaining <= 10 && running ? 'text-amber-600' : 'text-slate-900'}`}>
          {done ? t('break.over') : fmt(remaining)}
        </span>
      )}
      <span className="text-xs text-slate-400">{t('break.max')}</span>
      <div className="ml-auto flex gap-2">
        {!running
          ? <button className="btn-primary text-xs" onClick={start}>▶ {t('timer.start')}</button>
          : <button className="btn-ghost text-xs" onClick={() => setRunning(false)}>⏸ {t('timer.pause')}</button>}
        <button className="btn-ghost text-xs" onClick={reset}>↺ {t('timer.reset')}</button>
      </div>
    </div>
  );
}
