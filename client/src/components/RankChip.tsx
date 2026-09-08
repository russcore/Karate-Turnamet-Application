import BeltSwatch from './BeltSwatch';

interface Props {
  name?: string | null;
  color?: string | null;
  stripeColor?: string | null;
  stripeCount?: number | null;
}

export default function RankChip({ name, color, stripeColor, stripeCount }: Props) {
  if (!name) return null;
  return (
    <span className="badge border border-slate-200 bg-slate-50 text-slate-700">
      <BeltSwatch color={color} stripeColor={stripeColor} stripeCount={stripeCount} width={20} height={8} />
      <span className="ml-1">{name}</span>
    </span>
  );
}
