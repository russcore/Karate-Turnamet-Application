interface Medal {
  place: number;
  name: string;
  school?: string | null;
}

const STEP = [
  null,
  { medal: '🥇', color: 'linear-gradient(180deg,#fde68a,#f59e0b)', h: 190, label: '1' },
  { medal: '🥈', color: 'linear-gradient(180deg,#e5e7eb,#94a3b8)', h: 140, label: '2' },
  { medal: '🥉', color: 'linear-gradient(180deg,#fdba74,#c2410c)', h: 100, label: '3' },
] as const;

function Step({ m, place }: { m?: Medal; place: 1 | 2 | 3 }) {
  const s = STEP[place]!;
  return (
    <div className="flex w-36 flex-col items-center justify-end sm:w-44">
      {m ? (
        <div className="mb-3 flex flex-col items-center text-center">
          <div className="text-5xl drop-shadow">{s.medal}</div>
          <div className="mt-1 text-lg font-bold leading-tight text-white sm:text-xl">{m.name}</div>
          {m.school && <div className="text-xs text-white/60">{m.school}</div>}
        </div>
      ) : (
        <div className="mb-3 text-white/30">—</div>
      )}
      <div
        className="flex w-full items-start justify-center rounded-t-2xl pt-3 text-4xl font-black text-white/90 shadow-2xl"
        style={{ height: s.h, background: s.color }}
      >
        {s.label}
      </div>
    </div>
  );
}

/** Olympic-style winners' podium (2nd · 1st · 3rd). Self-contained dark premium panel. */
export default function Podium({ medals, title }: { medals: Medal[]; title?: string }) {
  const byPlace = (p: number) => medals.find((m) => m.place === p);
  return (
    <div className="rounded-3xl bg-gradient-to-b from-slate-900 to-slate-800 p-8 shadow-xl ring-1 ring-white/10">
      <div className="mb-1 text-center text-sm font-semibold uppercase tracking-[0.3em] text-amber-400">Winners</div>
      {title && <div className="mb-8 text-center text-2xl font-black text-white sm:text-3xl">{title}</div>}
      <div className="flex items-end justify-center gap-3 sm:gap-6">
        <Step m={byPlace(2)} place={2} />
        <Step m={byPlace(1)} place={1} />
        <Step m={byPlace(3)} place={3} />
      </div>
    </div>
  );
}
