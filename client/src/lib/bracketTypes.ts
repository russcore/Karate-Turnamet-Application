export interface BracketMatch {
  id: number;
  round: number;
  position: number;
  isBronze: boolean;
  isFinal: boolean;
  fighterAId: number | null;
  fighterBId: number | null;
  winnerId: number | null;
  loserId: number | null;
  decision: string | null;
  scoreA: number | null;
  scoreB: number | null;
  status: 'pending' | 'ready' | 'done' | 'bye';
  runOrder: number;
  version: number;
  slotALabel: string | null;
  slotBLabel: string | null;
}

export interface BracketFighter {
  id: number;
  firstName: string;
  lastName: string;
  school: string | null;
  weight: number;
  rank: { name: string; beltColor: string; shortCode: string | null; stripeColor: string | null; stripeCount: number };
}

export interface BracketState {
  bracket: { id: number; categoryId: number; size: number; matches: BracketMatch[] };
  fighters: BracketFighter[];
  placements: { place: number; fighterId: number }[];
}

export function fighterMap(state: BracketState): Map<number, BracketFighter> {
  return new Map(state.fighters.map((f) => [f.id, f]));
}
