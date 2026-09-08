import type { AiSettings } from '../../types.js';
import type { FighterForGrouping, ProposedGroup } from './types.js';

const genderLabel = (g: string | null): string => (g === 'M' ? 'Male' : g === 'F' ? 'Female' : 'Open');

/**
 * Standard karate age divisions (WKF-aligned): narrow bands for children, wider for adults
 * where age matters far less than weight. Fighters are NEVER grouped across these brackets,
 * so you can never get e.g. a 6-year-old against a 20-year-old.
 */
export interface AgeBracket {
  min: number;
  max: number;
  name: string;
}
export const AGE_BRACKETS: AgeBracket[] = [
  { min: 0, max: 6, name: '5-6' },
  { min: 7, max: 8, name: '7-8' },
  { min: 9, max: 10, name: '9-10' },
  { min: 11, max: 12, name: '11-12' },
  { min: 13, max: 14, name: '13-14 Cadet' },
  { min: 15, max: 16, name: '15-16 Junior' },
  { min: 17, max: 20, name: '17-20 U21' },
  { min: 21, max: 35, name: '21-35 Senior' },
  { min: 36, max: 200, name: '36+ Veteran' },
];

export const bracketOf = (age: number): AgeBracket =>
  AGE_BRACKETS.find((b) => age >= b.min && age <= b.max) ?? AGE_BRACKETS[AGE_BRACKETS.length - 1];

export const genderLabelOf = (g: string | null): string => (g === 'M' ? 'Male' : g === 'F' ? 'Female' : 'Open');

const spanOf = (g: FighterForGrouping[]) => (g.length ? g[g.length - 1].weight - g[0].weight : 0);

/** Greedily group a weight-sorted list into weight categories: each ≤ maxSize and spanning ≤ maxSpan kg. */
function groupByWeight(members: FighterForGrouping[], maxSize: number, maxSpan: number): FighterForGrouping[][] {
  const out: FighterForGrouping[][] = [];
  let cur: FighterForGrouping[] = [];
  for (const f of members) {
    if (cur.length > 0 && (cur.length >= maxSize || f.weight - cur[0].weight > maxSpan)) {
      out.push(cur);
      cur = [];
    }
    cur.push(f);
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Merge undersized weight categories into an adjacent one — only while size ≤ maxSize AND span ≤ maxSpan. */
function absorbSmall(subs: FighterForGrouping[][], minSize: number, maxSize: number, maxSpan: number): FighterForGrouping[][] {
  const groups = subs.map((m) => [...m]);
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < groups.length; i++) {
      if (groups[i].length >= minSize) continue;
      const tryMerge = (j: number): boolean => {
        if (j < 0 || j >= groups.length) return false;
        const merged = [...groups[i], ...groups[j]].sort((a, b) => a.weight - b.weight);
        if (merged.length > maxSize || spanOf(merged) > maxSpan) return false;
        groups[Math.min(i, j)] = merged;
        groups.splice(Math.max(i, j), 1);
        return true;
      };
      if (tryMerge(i - 1) || tryMerge(i + 1)) {
        changed = true;
        break;
      }
    }
  }
  return groups;
}

/**
 * Deterministic, fully-offline auto-grouping.
 * Returns real groups (size minSize..8, single gender, single age bracket) plus the ids of
 * fighters that could not form a group of at least minSize — those are left UNGROUPED so a
 * coach can arrange them manually (a 2-fighter "special bout" is never created automatically).
 */
export function proposeLocal(fighters: FighterForGrouping[], s: AiSettings): { groups: ProposedGroup[]; leftover: number[] } {
  const minSize = Math.max(3, s.minGroupSize); // never auto-create a 2-fighter group
  const maxSize = Math.min(8, s.maxGroupSize);
  const splitSpan = Math.max(2, s.weightBand); // tight weight category (kg) for the initial split
  const maxSpan = splitSpan * 3; // hard cap on a group's weight spread (e.g. 15kg) — prevents big mismatches

  // Bucket by gender + standard age bracket (never mixed).
  const buckets = new Map<string, { gender: string | null; bracket: AgeBracket; members: FighterForGrouping[] }>();
  for (const f of fighters) {
    const bracket = bracketOf(f.age);
    const key = `${f.gender ?? 'X'}|${bracket.name}`;
    let b = buckets.get(key);
    if (!b) {
      b = { gender: f.gender ?? null, bracket, members: [] };
      buckets.set(key, b);
    }
    b.members.push(f);
  }

  const groups: ProposedGroup[] = [];
  const leftover: number[] = [];

  for (const b of buckets.values()) {
    const sorted = [...b.members].sort((a, b2) => a.weight - b2.weight);
    const subs = absorbSmall(groupByWeight(sorted, maxSize, splitSpan), minSize, maxSize, maxSpan);
    for (const g of subs) {
      if (g.length >= minSize) groups.push(materialize(b.gender, b.bracket, g));
      else leftover.push(...g.map((m) => m.id)); // 1-2 fighters -> manual special bout
    }
  }

  // Youngest first (kids fight first), then gender, then lightest first.
  groups.sort((a, b2) => a.ageMin - b2.ageMin || (a.gender ?? '').localeCompare(b2.gender ?? '') || a.weightMin - b2.weightMin);
  return { groups, leftover };
}

function materialize(gender: string | null, bracket: AgeBracket, members: FighterForGrouping[]): ProposedGroup {
  const ages = members.map((m) => m.age);
  const weights = members.map((m) => m.weight);
  const rankIds = [...new Set(members.map((m) => m.rankId))];
  const weightMin = Math.min(...weights);
  const weightMax = Math.max(...weights);
  return {
    name: `${genderLabel(gender)} ${bracket.name}, ${weightMin}-${weightMax}kg`,
    discipline: 'kumite',
    gender,
    ageMin: Math.min(...ages),
    ageMax: Math.max(...ages),
    weightMin,
    weightMax,
    rankIds,
    fighterIds: members.map((m) => m.id),
  };
}
