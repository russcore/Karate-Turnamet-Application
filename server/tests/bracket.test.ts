import { describe, expect, it } from 'vitest';
import {
  buildBracketPlan,
  computePlacements,
  nextBracketSize,
  recompute,
  roundsFor,
  seedSlotOrder,
  type MatchState,
} from '../src/services/bracket.js';

/** Build slot fighters (length = size) from an ordered list of fighter ids, seeds by standard order. */
function seatFighters(ids: (number | null)[]): (number | null)[] {
  const size = nextBracketSize(ids.length);
  const seats = seedSlotOrder(size);
  return seats.map((seed) => (seed <= ids.length ? ids[seed - 1] : null));
}

const find = (ms: MatchState[], round: number, position: number, bronze = false) =>
  ms.find((m) => m.round === round && m.position === position && m.isBronze === bronze)!;

function setWinner(ms: MatchState[], round: number, position: number, winnerId: number, size: number, bronze = false) {
  find(ms, round, position, bronze).winnerId = winnerId;
  recompute(ms, size, 'single');
}

describe('bracket sizing', () => {
  it('rounds up to the nearest power of two (max 8)', () => {
    expect(nextBracketSize(2)).toBe(2);
    expect(nextBracketSize(3)).toBe(4);
    expect(nextBracketSize(4)).toBe(4);
    expect(nextBracketSize(5)).toBe(8);
    expect(nextBracketSize(8)).toBe(8);
    expect(() => nextBracketSize(1)).toThrow();
    expect(() => nextBracketSize(9)).toThrow();
  });

  it('seeds 1 and 2 land in opposite halves for size 8', () => {
    const order = seedSlotOrder(8);
    expect(order).toHaveLength(8);
    const half1 = order.slice(0, 4);
    const half2 = order.slice(4);
    expect(half1).toContain(1);
    expect(half2).toContain(2);
  });
});

describe('bye placement', () => {
  it('a 5-fighter bracket has 3 byes in distinct first-round matches', () => {
    const ids = [101, 102, 103, 104, 105];
    const { size, matches } = buildBracketPlan(seatFighters(ids), 'single');
    expect(size).toBe(8);
    const round1 = matches.filter((m) => m.round === 1 && !m.isBronze);
    const byes = round1.filter((m) => m.status === 'bye');
    expect(byes).toHaveLength(3);
    // The one real first-round match should be ready with two fighters.
    const real = round1.filter((m) => m.status === 'ready');
    expect(real).toHaveLength(1);
    expect(real[0].fighterAId).not.toBeNull();
    expect(real[0].fighterBId).not.toBeNull();
  });

  it('a 3-fighter bracket seats into size 4 with one bye', () => {
    const { size, matches } = buildBracketPlan(seatFighters([1, 2, 3]), 'single');
    expect(size).toBe(4);
    const byes = matches.filter((m) => m.round === 1 && m.status === 'bye');
    expect(byes).toHaveLength(1);
  });

  it('a 2-fighter bracket is a single final with no bronze', () => {
    const { size, matches } = buildBracketPlan(seatFighters([1, 2]), 'single');
    expect(size).toBe(2);
    expect(matches.filter((m) => m.isBronze)).toHaveLength(0);
    expect(find(matches, 1, 0).isFinal).toBe(true);
  });
});

describe('winner advancement + bronze routing (8 fighters)', () => {
  it('advances winners and routes semifinal losers to the bronze match', () => {
    const ids = [101, 102, 103, 104, 105, 106, 107, 108];
    const { size, matches } = buildBracketPlan(seatFighters(ids), 'single');
    const R = roundsFor(size); // 3

    // Decide all quarterfinals: fighterA wins each.
    for (let p = 0; p < 4; p++) setWinner(matches, 1, p, find(matches, 1, p).fighterAId!, size);

    // Semifinals now have fighters.
    const sf0 = find(matches, 2, 0);
    const sf1 = find(matches, 2, 1);
    expect(sf0.fighterAId).not.toBeNull();
    expect(sf0.fighterBId).not.toBeNull();

    // Decide semifinals: fighterA wins each.
    const sf0Loser = sf0.fighterBId!;
    const sf1Loser = sf1.fighterBId!;
    setWinner(matches, 2, 0, sf0.fighterAId!, size);
    setWinner(matches, 2, 1, sf1.fighterAId!, size);

    // Final + bronze should now be populated.
    const final = find(matches, R, 0);
    const bronze = find(matches, R, 1, true);
    expect(final.fighterAId).not.toBeNull();
    expect(final.fighterBId).not.toBeNull();
    expect([bronze.fighterAId, bronze.fighterBId].sort()).toEqual([sf0Loser, sf1Loser].sort());

    // Decide final + bronze.
    setWinner(matches, R, 0, final.fighterAId!, size);
    setWinner(matches, R, 1, bronze.fighterAId!, size, true);

    const places = computePlacements(matches, size, 'single');
    const byPlace = Object.fromEntries(places.map((p) => [p.place, p.fighterId]));
    expect(byPlace[1]).toBe(final.fighterAId);
    expect(byPlace[2]).toBe(final.loserId);
    expect(byPlace[3]).toBe(bronze.fighterAId);
    expect(byPlace[4]).toBe(bronze.loserId);
  });
});

describe('result revert cascade', () => {
  it('reverting a semifinal clears the final and bronze that depended on it', () => {
    const ids = [101, 102, 103, 104, 105, 106, 107, 108];
    const { size, matches } = buildBracketPlan(seatFighters(ids), 'single');
    const R = roundsFor(size);
    for (let p = 0; p < 4; p++) setWinner(matches, 1, p, find(matches, 1, p).fighterAId!, size);
    setWinner(matches, 2, 0, find(matches, 2, 0).fighterAId!, size);
    setWinner(matches, 2, 1, find(matches, 2, 1).fighterAId!, size);
    setWinner(matches, R, 0, find(matches, R, 0).fighterAId!, size);
    setWinner(matches, R, 1, find(matches, R, 1, true).fighterAId!, size, true);
    expect(computePlacements(matches, size, 'single')).toHaveLength(4);

    // Revert semifinal 0.
    find(matches, 2, 0).winnerId = null;
    recompute(matches, size, 'single');

    const final = find(matches, R, 0);
    const bronze = find(matches, R, 1, true);
    // Final lost a fighter (the SF0 winner) and is no longer decided.
    expect(final.status).not.toBe('done');
    // Bronze lost the SF0 loser slot.
    expect(bronze.fighterAId).toBeNull();
    expect(computePlacements(matches, size, 'single').length).toBeLessThan(4);
  });
});
