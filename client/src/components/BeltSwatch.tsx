interface Props {
  color?: string | null;
  stripeColor?: string | null;
  stripeCount?: number | null;
  width?: number;
  height?: number;
}

/** A small belt bar: base colour plus N vertical stripes near the right end (kyokushin style). */
export default function BeltSwatch({ color, stripeColor, stripeCount, width = 34, height = 12 }: Props) {
  const count = stripeColor && stripeCount ? Math.min(stripeCount, 10) : 0;
  return (
    <span
      className="relative inline-flex shrink-0 items-center overflow-hidden rounded-sm border border-slate-300"
      style={{ width, height, background: color ?? '#ccc' }}
    >
      {count > 0 && (
        <span className="absolute inset-y-0 right-1 flex items-center gap-[2px]">
          {Array.from({ length: count }).map((_, i) => (
            <span key={i} style={{ width: 2.5, height: height - 3, background: stripeColor ?? '#111', display: 'inline-block' }} />
          ))}
        </span>
      )}
    </span>
  );
}
