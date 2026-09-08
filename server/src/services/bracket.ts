import { prisma } from '../db.js';
import { writeAudit } from './audit.js';
import type { MatchStatus } from '../types.js';

/** Public error for optimistic-lock conflicts (mapped to HTTP 409 by the route). */
export class VersionConflictError extends Error {
  constructor(msg = 'Match was modified by someone else') {
    super(msg);
    this.name = 'VersionConflictError';
  }
}

// ----------------------------------------------------------------------------
// Pure bracket logic (no DB) — exported for unit tests.
// ----------------------------------------------------------------------------

export type SeedMode = 'random' | 'rank' | 'manual' | 'age' | 'weight';

/** Smallest single-elim size (2/4/8) that fits n fighters. Max 8 per the spec. */
export function nextBracketSize(n: number): number {
  if (n < 2) throw new Error('A bracket needs at least 2 fighters');
  if (n > 8) throw new Error('A bracket allows at most 8 fighters');
  if (n <= 2) return 2;
  if (n <= 4) return 4;
  return 8;
}

/** Number of main rounds (QF/SF/Final ...) for a bracket size. */
export function roundsFor(size: number): number {
  return Math.round(Math.log2(size));
}

/**
 * Standard seeding slot order: returns the seed (1-indexed) that belongs in each
 * first-round slot, arranged so #1 and #2 can only meet in the final.
 * size=2 -> [1,2]; size=4 -> [1,4,2,3]; size=8 -> [1,8,4,5,2,7,3,6].
 */
export function seedSlotOrder(size: number): number[] {
  let order = [1, 2];
  const rounds = roundsFor(size);
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

/** Order fighter ids into seeds 1..n according to the chosen mode. */
export function orderFightersBySeed(
  entries: { fighterId: number; seed: number; rankOrder: number; age: number; weight: number }[],
  mode: SeedMode,
): number[] {
  const list = [...entries];
  if (mode === 'random') {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  } else if (mode === 'rank') {
    list.sort((a, b) => b.rankOrder - a.rankOrder || a.fighterId - b.fighterId); // most senior seeded first
  } else if (mode === 'age') {
    list.sort((a, b) => a.age - b.age || a.fighterId - b.fighterId); // youngest first
  } else if (mode === 'weight') {
    list.sort((a, b) => a.weight - b.weight || a.fighterId - b.fighterId); // lightest first
  } else {
    list.sort((a, b) => (a.seed || 9999) - (b.seed || 9999) || a.fighterId - b.fighterId); // manual order
  }
  return list.map((e) => e.fighterId);
}

/**
 * Best-effort: spread same-school fighters apart so they meet as late as possible
 * (ideally never), only pairing them when there's no alternative. Byes stay on the
 * top seeds — we only rearrange fighters in *contested* first-round matches, so this
 * never takes a bye away from a higher-ranked fighter.
 */
export function avoidSameSchoolFirstRound(
  slots: (number | null)[],
  schoolOf: Map<number, string | null>,
): (number | null)[] {
  const size = slots.length;
  const s = [...slots];
  const sameSchool = (a: number | null, b: number | null) => {
    if (a == null || b == null) return false;
    const sa = schoolOf.get(a);
    return !!sa && sa === schoolOf.get(b);
  };
  // Region cost: same first-round match (100) > same quarter, meet R2 (10) > same half, meet R3 (1).
  const cost = (arr: (number | null)[]): number => {
    let c = 0;
    for (let i = 0; i < size; i++) {
      for (let j = i + 1; j < size; j++) {
        if (!sameSchool(arr[i], arr[j])) continue;
        if (i >> 1 === j >> 1) c += 100;
        else if (i >> 2 === j >> 2) c += 10;
        else if (i >> 3 === j >> 3) c += 1;
      }
    }
    return c;
  };
  // Only slots whose opponent is also a real fighter may move (keeps byes with their seed).
  const swappable = [...Array(size).keys()].filter((i) => s[i] != null && s[i ^ 1] != null);

  let best = cost(s);
  let improved = true;
  let guard = 0;
  while (improved && best > 0 && guard++ < 200) {
    improved = false;
    for (const i of swappable) {
      for (const j of swappable) {
        if (j <= i) continue;
        [s[i], s[j]] = [s[j], s[i]];
        const c = cost(s);
        if (c < best) {
          best = c;
          improved = true;
        } else {
          [s[i], s[j]] = [s[j], s[i]];
        }
      }
    }
  }
  return s;
}

export interface MatchState {
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
  status: MatchStatus;
  slotALabel: string | null;
  slotBLabel: string | null;
}

const key = (round: number, position: number, isBronze = false) =>
  `${round}:${position}:${isBronze ? 'b' : 'm'}`;

/** Build the empty match skeleton for a bracket, seating the first round + byes. */
export function buildBracketPlan(
  slotFighters: (number | null)[],
  bronzeMode: 'single' | 'double',
): { size: number; matches: MatchState[] } {
  const size = slotFighters.length;
  const R = roundsFor(size);
  const matches: MatchState[] = [];

  for (let r = 1; r <= R; r++) {
    const count = size / Math.pow(2, r);
    for (let p = 0; p < count; p++) {
      const isFinal = r === R && p === 0;
      matches.push({
        round: r,
        position: p,
        isBronze: false,
        isFinal,
        fighterAId: r === 1 ? slotFighters[2 * p] ?? null : null,
        fighterBId: r === 1 ? slotFighters[2 * p + 1] ?? null : null,
        winnerId: null,
        loserId: null,
        decision: null,
        scoreA: null,
        scoreB: null,
        status: 'pending',
        slotALabel: r === 1 ? null : labelFor(r - 1, 2 * p),
        slotBLabel: r === 1 ? null : labelFor(r - 1, 2 * p + 1),
      });
    }
  }

  // Bronze match: only when a semifinal round exists (size >= 4) and single-bronze mode.
  if (size >= 4 && bronzeMode === 'single') {
    matches.push({
      round: R,
      position: 1,
      isBronze: true,
      isFinal: false,
      fighterAId: null,
      fighterBId: null,
      winnerId: null,
      loserId: null,
      decision: null,
      scoreA: null,
      scoreB: null,
      status: 'pending',
      slotALabel: `From SF1`,
      slotBLabel: `From SF2`,
    });
  }

  recompute(matches, size, bronzeMode);
  return { size, matches };
}

function labelFor(round: number, position: number): string {
  const names: Record<number, string> = { 1: 'QF', 2: 'SF', 3: 'F' };
  return `Winner ${names[round] ?? 'R' + round}${position + 1}`;
}

const decidedWinner = (m: MatchState | undefined): number | null =>
  m && (m.status === 'done' || m.status === 'bye') ? m.winnerId : null;

const loserOf = (m: MatchState | undefined): number | null => {
  if (!m || m.status !== 'done' || m.winnerId == null) return null;
  if (m.fighterAId != null && m.fighterAId !== m.winnerId) return m.fighterAId;
  if (m.fighterBId != null && m.fighterBId !== m.winnerId) return m.fighterBId;
  return null;
};

/**
 * Single source of truth for propagation. Derives round>=2 fighters from decided
 * feeders, resolves round-1 byes, routes semifinal losers into the bronze match,
 * and clears any result whose inputs are no longer valid (cascade on revert).
 */
export function recompute(
  matches: MatchState[],
  size: number,
  bronzeMode: 'single' | 'double',
): void {
  const R = roundsFor(size);
  const byKey = new Map<string, MatchState>();
  for (const m of matches) byKey.set(key(m.round, m.position, m.isBronze), m);
  const get = (r: number, p: number, b = false) => byKey.get(key(r, p, b));

  for (let r = 1; r <= R; r++) {
    const count = size / Math.pow(2, r);
    for (let p = 0; p < count; p++) {
      const m = get(r, p);
      if (!m) continue;

      if (r > 1) {
        m.fighterAId = decidedWinner(get(r - 1, 2 * p));
        m.fighterBId = decidedWinner(get(r - 1, 2 * p + 1));
      }
      evaluateMatch(m, r === 1);
    }
  }

  // Bronze: fed by the two semifinal losers (semifinals live at round R-1).
  const bronze = get(R, 1, true);
  if (bronze) {
    bronze.fighterAId = loserOf(get(R - 1, 0));
    bronze.fighterBId = loserOf(get(R - 1, 1));
    evaluateMatch(bronze, false);
  }
}

/** Resolve one match's own status/winner given its two fighter slots. */
function evaluateMatch(m: MatchState, isFirstRound: boolean): void {
  const a = m.fighterAId;
  const b = m.fighterBId;

  // Round-1 bye: exactly one real fighter -> auto-advance.
  if (isFirstRound && ((a != null) !== (b != null))) {
    m.winnerId = (a ?? b) as number;
    m.loserId = null;
    m.status = 'bye';
    m.decision = null;
    return;
  }

  if (a != null && b != null) {
    if (m.winnerId === a || m.winnerId === b) {
      m.loserId = m.winnerId === a ? b : a;
      m.status = 'done';
    } else {
      // Winner missing or no longer valid -> clear (revert cascade).
      m.winnerId = null;
      m.loserId = null;
      m.decision = null;
      m.scoreA = null;
      m.scoreB = null;
      m.status = 'ready';
    }
    return;
  }

  // Missing a fighter (feeder undecided) -> pending, clear any stale result.
  m.winnerId = null;
  m.loserId = null;
  m.decision = null;
  m.scoreA = null;
  m.scoreB = null;
  m.status = 'pending';
}

export function computePlacements(
  matches: MatchState[],
  size: number,
  bronzeMode: 'single' | 'double',
): { place: number; fighterId: number }[] {
  const R = roundsFor(size);
  const byKey = new Map<string, MatchState>();
  for (const m of matches) byKey.set(key(m.round, m.position, m.isBronze), m);
  const get = (r: number, p: number, b = false) => byKey.get(key(r, p, b));
  const out: { place: number; fighterId: number }[] = [];

  const final = get(R, 0);
  if (final && final.status === 'done' && final.winnerId != null && final.loserId != null) {
    out.push({ place: 1, fighterId: final.winnerId });
    out.push({ place: 2, fighterId: final.loserId });
  }

  if (size >= 4) {
    if (bronzeMode === 'single') {
      const bronze = get(R, 1, true);
      if (bronze && bronze.status === 'done' && bronze.winnerId != null && bronze.loserId != null) {
        out.push({ place: 3, fighterId: bronze.winnerId });
        out.push({ place: 4, fighterId: bronze.loserId });
      }
    } else {
      // double bronze: both semifinal losers share 3rd (stored as places 3 & 4).
      const l1 = loserOf(get(R - 1, 0));
      const l2 = loserOf(get(R - 1, 1));
      if (l1 != null) out.push({ place: 3, fighterId: l1 });
      if (l2 != null) out.push({ place: 4, fighterId: l2 });
    }
  }
  return out;
}

// ----------------------------------------------------------------------------
// DB operations
// ----------------------------------------------------------------------------

async function bronzeModeForCategory(categoryId: number): Promise<'single' | 'double'> {
  const cat = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { event: { select: { bronzeMode: true } } },
  });
  return (cat?.event.bronzeMode as 'single' | 'double') ?? 'single';
}

/** (Re)generate the bracket for a category from its entries. Replaces any prior bracket. */
export async function generateBracket(
  categoryId: number,
  mode: SeedMode,
  userId?: number,
): Promise<void> {
  const entries = await prisma.categoryEntry.findMany({
    where: { categoryId },
    include: { fighter: { select: { rankId: true, school: true, age: true, weight: true, rank: { select: { order: true } } } } },
  });
  if (entries.length < 2) throw new Error('Need at least 2 fighters to generate a bracket');

  const bronzeMode = await bronzeModeForCategory(categoryId);
  const seedInput = entries.map((e) => ({
    fighterId: e.fighterId,
    seed: e.seed,
    rankOrder: e.fighter.rank?.order ?? 0,
    age: e.fighter.age,
    weight: e.fighter.weight,
  }));
  const orderedIds = orderFightersBySeed(seedInput, mode);
  const size = nextBracketSize(orderedIds.length);

  // Seat fighters into slots.
  const seats = seedSlotOrder(size);
  const bySeed = orderedIds; // index 0 = seed 1
  let slotFighters: (number | null)[] = seats.map((seed) => (seed <= bySeed.length ? bySeed[seed - 1] : null));

  const schoolOf = new Map<number, string | null>(entries.map((e) => [e.fighterId, e.fighter.school]));
  slotFighters = avoidSameSchoolFirstRound(slotFighters, schoolOf);

  const { matches } = buildBracketPlan(slotFighters, bronzeMode);

  await prisma.$transaction(async (tx) => {
    await tx.bracket.deleteMany({ where: { categoryId } });
    await tx.placement.deleteMany({ where: { categoryId } });
    const bracket = await tx.bracket.create({ data: { categoryId, size } });
    for (const m of matches) {
      await tx.match.create({
        data: {
          bracketId: bracket.id,
          round: m.round,
          position: m.position,
          isBronze: m.isBronze,
          isFinal: m.isFinal,
          fighterAId: m.fighterAId,
          fighterBId: m.fighterBId,
          winnerId: m.winnerId,
          loserId: m.loserId,
          status: m.status,
          slotALabel: m.slotALabel,
          slotBLabel: m.slotBLabel,
        },
      });
    }
    await tx.category.update({ where: { id: categoryId }, data: { status: 'in_progress' } });
    await persistPlacements(tx, categoryId, computePlacements(matches, size, bronzeMode));
  });

  await writeAudit({ userId, entity: 'bracket', entityId: String(categoryId), action: 'generate', after: { size, mode } });
}

function rowToState(m: any): MatchState {
  return {
    round: m.round,
    position: m.position,
    isBronze: m.isBronze,
    isFinal: m.isFinal,
    fighterAId: m.fighterAId,
    fighterBId: m.fighterBId,
    winnerId: m.winnerId,
    loserId: m.loserId,
    decision: m.decision,
    scoreA: m.scoreA,
    scoreB: m.scoreB,
    status: m.status,
    slotALabel: m.slotALabel,
    slotBLabel: m.slotBLabel,
  };
}

export interface SetResultInput {
  winnerId: number;
  decision?: string | null;
  scoreA?: number | null;
  scoreB?: number | null;
  extensions?: unknown[];
  durationSec?: number | null;
  notes?: string | null;
  expectedVersion?: number;
}

/** Record a match winner and propagate. Optimistic-locked on `expectedVersion`. */
export async function setMatchResult(matchId: number, input: SetResultInput, userId?: number) {
  return prisma.$transaction(async (tx) => {
    const target = await tx.match.findUnique({ where: { id: matchId }, include: { bracket: true } });
    if (!target) throw new Error('Match not found');
    if (input.expectedVersion != null && input.expectedVersion !== target.version) {
      throw new VersionConflictError();
    }
    // A decided fight is locked. To change it you must revert first (which cascades downstream).
    if (target.status === 'done') {
      throw new Error('This fight is already decided — revert it first to change the result.');
    }
    if (input.winnerId !== target.fighterAId && input.winnerId !== target.fighterBId) {
      throw new Error('Winner must be one of the two fighters in the match');
    }

    const rows = await tx.match.findMany({ where: { bracketId: target.bracketId } });
    const states = rows.map(rowToState);
    const targetState = states.find((s) => s.round === target.round && s.position === target.position && s.isBronze === target.isBronze)!;

    const before = { winnerId: target.winnerId };
    targetState.winnerId = input.winnerId;
    targetState.decision = input.decision ?? targetState.decision ?? null;
    targetState.scoreA = input.scoreA ?? null;
    targetState.scoreB = input.scoreB ?? null;

    recompute(states, target.bracket.size, await bronzeModeForCategory(target.bracket.categoryId));

    await persistStates(tx, rows, states, {
      matchId,
      decision: input.decision,
      scoreA: input.scoreA,
      scoreB: input.scoreB,
      extensions: input.extensions,
      durationSec: input.durationSec,
      notes: input.notes,
      bumpVersion: true,
      userId,
    });

    const placements = computePlacements(states, target.bracket.size, await bronzeModeForCategory(target.bracket.categoryId));
    await persistPlacements(tx, target.bracket.categoryId, placements);
    await updateCategoryStatus(tx, target.bracket.categoryId, states, target.bracket.size);

    await writeAudit(
      { userId, entity: 'match', entityId: String(matchId), action: 'set_result', before, after: { winnerId: input.winnerId, decision: input.decision } },
      tx,
    );
    return { categoryId: target.bracket.categoryId };
  });
}

/**
 * Manually reorder a bout within its round (e.g. a fighter is late — postpone their bout and run
 * the next one, then bring it back). Only affects running order, never the bracket structure.
 * 'later' pushes the bout behind its siblings; 'now' pulls it in front.
 */
export async function reorderMatch(matchId: number, direction: 'now' | 'later', userId?: number) {
  return prisma.$transaction(async (tx) => {
    const target = await tx.match.findUnique({ where: { id: matchId }, include: { bracket: true } });
    if (!target) throw new Error('Match not found');
    if (target.status === 'done' || target.status === 'bye') throw new Error('Cannot reorder a finished bout');
    // Siblings in the same round/phase whose order can still change.
    const sibs = await tx.match.findMany({
      where: { bracketId: target.bracketId, round: target.round, isBronze: target.isBronze, isFinal: target.isFinal },
    });
    const orders = sibs.map((s) => s.runOrder);
    const newOrder = direction === 'now' ? Math.min(0, ...orders) - 1 : Math.max(0, ...orders) + 1;
    await tx.match.update({ where: { id: matchId }, data: { runOrder: newOrder } });
    await writeAudit({ userId, entity: 'match', entityId: String(matchId), action: 'reorder', after: { direction, runOrder: newOrder } }, tx);
    return { categoryId: target.bracket.categoryId };
  });
}

/** Clear a match result and cascade-clear everything downstream that depended on it. */
export async function clearMatchResult(matchId: number, userId?: number) {
  return prisma.$transaction(async (tx) => {
    const target = await tx.match.findUnique({ where: { id: matchId }, include: { bracket: true } });
    if (!target) throw new Error('Match not found');

    const rows = await tx.match.findMany({ where: { bracketId: target.bracketId } });
    const states = rows.map(rowToState);
    const targetState = states.find((s) => s.round === target.round && s.position === target.position && s.isBronze === target.isBronze)!;
    const before = { winnerId: target.winnerId };
    targetState.winnerId = null;
    targetState.decision = null;
    targetState.scoreA = null;
    targetState.scoreB = null;

    const bronzeMode = await bronzeModeForCategory(target.bracket.categoryId);
    recompute(states, target.bracket.size, bronzeMode);
    await persistStates(tx, rows, states, { matchId, clear: true, bumpVersion: true, userId });
    await persistPlacements(tx, target.bracket.categoryId, computePlacements(states, target.bracket.size, bronzeMode));
    await updateCategoryStatus(tx, target.bracket.categoryId, states, target.bracket.size);

    await writeAudit({ userId, entity: 'match', entityId: String(matchId), action: 'revert', before, after: { winnerId: null } }, tx);
    return { categoryId: target.bracket.categoryId };
  });
}

async function persistStates(
  tx: any,
  rows: any[],
  states: MatchState[],
  extra: {
    matchId: number;
    decision?: string | null;
    scoreA?: number | null;
    scoreB?: number | null;
    extensions?: unknown[];
    durationSec?: number | null;
    notes?: string | null;
    clear?: boolean;
    bumpVersion?: boolean;
    userId?: number;
  },
): Promise<void> {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const st = states.find((s) => s.round === row.round && s.position === row.position && s.isBronze === row.isBronze)!;
    const isTarget = row.id === extra.matchId;
    const data: any = {
      fighterAId: st.fighterAId,
      fighterBId: st.fighterBId,
      winnerId: st.winnerId,
      loserId: st.loserId,
      status: st.status,
      decision: st.decision,
      scoreA: st.scoreA,
      scoreB: st.scoreB,
    };
    if (isTarget) {
      if (extra.clear) {
        data.extensions = '[]';
        data.durationSec = null;
        data.notes = null;
      } else {
        if (extra.extensions !== undefined) data.extensions = JSON.stringify(extra.extensions ?? []);
        if (extra.durationSec !== undefined) data.durationSec = extra.durationSec;
        if (extra.notes !== undefined) data.notes = extra.notes;
      }
      if (extra.bumpVersion) data.version = row.version + 1;
      data.updatedById = extra.userId ?? null;
    }
    await tx.match.update({ where: { id: row.id }, data });
  }
}

async function persistPlacements(
  tx: any,
  categoryId: number,
  placements: { place: number; fighterId: number }[],
): Promise<void> {
  await tx.placement.deleteMany({ where: { categoryId } });
  for (const p of placements) {
    await tx.placement.create({ data: { categoryId, place: p.place, fighterId: p.fighterId } });
  }
}

async function updateCategoryStatus(tx: any, categoryId: number, states: MatchState[], size: number): Promise<void> {
  const R = roundsFor(size);
  const final = states.find((s) => s.round === R && s.position === 0 && !s.isBronze);
  const anyDone = states.some((s) => s.status === 'done');
  const status = final?.status === 'done' ? 'done' : anyDone ? 'in_progress' : 'in_progress';
  await tx.category.update({ where: { id: categoryId }, data: { status } });
}

/** Auto-play a bracket to completion with random winners (for demos / testing bigger tatami). */
export async function simulateBracket(categoryId: number, userId?: number): Promise<void> {
  const existing = await prisma.bracket.findUnique({ where: { categoryId } });
  if (!existing) await generateBracket(categoryId, 'rank', userId);

  const decisions = ['ippon', 'waza-ari', 'hantei'];
  for (let guard = 0; guard < 100; guard++) {
    const matches = await prisma.match.findMany({ where: { bracket: { categoryId } } });
    const ready = matches.find((m) => m.status === 'ready' && m.fighterAId != null && m.fighterBId != null && m.winnerId == null);
    if (!ready) break;
    const winnerId = Math.random() < 0.5 ? ready.fighterAId! : ready.fighterBId!;
    await setMatchResult(
      ready.id,
      { winnerId, decision: decisions[Math.floor(Math.random() * decisions.length)], expectedVersion: ready.version },
      userId,
    );
  }
}

/** Load a full bracket view (matches + resolved fighters + placements). */
export async function getBracketState(categoryId: number) {
  const bracket = await prisma.bracket.findUnique({
    where: { categoryId },
    include: { matches: { orderBy: [{ round: 'asc' }, { isBronze: 'asc' }, { position: 'asc' }] } },
  });
  if (!bracket) return null;

  const fighterIds = new Set<number>();
  for (const m of bracket.matches) {
    for (const id of [m.fighterAId, m.fighterBId, m.winnerId, m.loserId]) if (id != null) fighterIds.add(id);
  }
  const fighters = await prisma.fighter.findMany({
    where: { id: { in: [...fighterIds] } },
    include: { rank: { select: { name: true, beltColor: true, shortCode: true, stripeColor: true, stripeCount: true } } },
  });
  const placements = await prisma.placement.findMany({ where: { categoryId }, orderBy: { place: 'asc' } });
  return { bracket, fighters, placements };
}
