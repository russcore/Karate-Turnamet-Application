// Client-side mirror of the server's bracket seeding (server/src/services/bracket.ts),
// used to preview first-round pairings in the category editor before a bracket is generated.

export function nextBracketSize(n: number): number {
  if (n <= 2) return 2;
  if (n <= 4) return 4;
  return 8;
}

/**
 * Standard seeding slot order: the seed (1-indexed) that belongs in each first-round slot,
 * arranged so #1 and #2 can only meet in the final.
 * size=2 -> [1,2]; size=4 -> [1,4,2,3]; size=8 -> [1,8,4,5,2,7,3,6].
 */
export function seedSlotOrder(size: number): number[] {
  let order = [1, 2];
  const rounds = Math.round(Math.log2(size));
  for (let r = 1; r < rounds; r++) {
    const sum = order.length * 2 + 1;
    const next: number[] = [];
    for (const s of order) {
      next.push(s);
      next.push(sum - s);
    }
    order = next;
  }
  return order;
}

/**
 * Given fighters already ordered by seed (index 0 = seed 1), returns the first-round bouts.
 * Each bout is a pair [A, B]; a null side is a BYE (that fighter auto-advances).
 * This mirrors the seed placement only (it does not replay the same-school spacing the server
 * may apply), so it's an accurate preview of standard seeding.
 */
export function firstRoundBouts<T>(seedOrdered: T[]): [T | null, T | null][] {
  const n = seedOrdered.length;
  if (n < 2) return [];
  const size = nextBracketSize(n);
  const seats = seedSlotOrder(size); // seat i holds this seed number
  const slots: (T | null)[] = seats.map((seed) => (seed <= n ? seedOrdered[seed - 1] : null));
  const bouts: [T | null, T | null][] = [];
  for (let i = 0; i < slots.length; i += 2) bouts.push([slots[i], slots[i + 1]]);
  return bouts;
}
