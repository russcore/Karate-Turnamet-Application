import type { BracketMatch } from './bracketTypes';

/**
 * Phase rank for the order bouts are fought:
 * round 1, round 2, … semifinals, then the BRONZE (3rd/4th) match, then the FINAL (1st/2nd) last.
 */
export function fightOrder(m: BracketMatch): number {
  if (m.isFinal) return 1_000_000;
  if (m.isBronze) return 999_999;
  return m.round * 1000 + m.position;
}

/**
 * Fight order, honouring a referee's manual reordering: within the same phase (round), a bout's
 * `runOrder` decides who goes first (a postponed bout gets a higher runOrder → runs later);
 * ties fall back to bracket position.
 */
export function orderedMatches(matches: BracketMatch[]): BracketMatch[] {
  const phase = (m: BracketMatch) => (m.isFinal ? 2_000_000 : m.isBronze ? 1_000_000 : m.round);
  return [...matches].sort(
    (a, b) => phase(a) - phase(b) || (a.runOrder ?? 0) - (b.runOrder ?? 0) || a.position - b.position,
  );
}

/** Map each non-bye match id to its 1-based bout number in fight order. */
export function fightNumbers(matches: BracketMatch[]): Map<number, number> {
  const map = new Map<number, number>();
  let n = 1;
  for (const m of orderedMatches(matches)) {
    if (m.status !== 'bye') map.set(m.id, n++);
  }
  return map;
}
