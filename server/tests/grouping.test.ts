import { describe, expect, it } from 'vitest';
import { AGE_BRACKETS, proposeLocal } from '../src/services/grouping/local.js';
import { DEFAULT_AI_SETTINGS } from '../src/types.js';
import type { FighterForGrouping } from '../src/services/grouping/types.js';

const bracketName = (age: number) => (AGE_BRACKETS.find((b) => age >= b.min && age <= b.max) ?? AGE_BRACKETS[AGE_BRACKETS.length - 1]).name;

function makeFighters(n: number, ageMin = 7, ageSpread = 30): FighterForGrouping[] {
  const out: FighterForGrouping[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: i + 1,
      firstName: 'F' + i,
      lastName: 'L' + i,
      gender: i % 2 === 0 ? 'M' : 'F',
      age: ageMin + (i % ageSpread),
      weight: 20 + (i % 12) * 5,
      rankId: 1 + (i % 3),
      rankName: 'R' + (i % 3),
      rankOrder: i % 3,
      school: 'School' + (i % 4),
    });
  }
  return out;
}

describe('local grouping engine (karate age rules)', () => {
  it('never mixes age brackets, never mixes gender, sizes are 3..8', () => {
    const fighters = makeFighters(120);
    const { groups, leftover } = proposeLocal(fighters, DEFAULT_AI_SETTINGS);

    const seen = new Set<number>();
    for (const g of groups) {
      expect(g.fighterIds.length).toBeGreaterThanOrEqual(3); // no auto 2-fighter groups
      expect(g.fighterIds.length).toBeLessThanOrEqual(8);
      const members = g.fighterIds.map((id) => fighters.find((f) => f.id === id)!);
      expect(new Set(members.map((m) => m.gender)).size).toBe(1);
      expect(new Set(members.map((m) => bracketName(m.age))).size).toBe(1); // single age bracket
      for (const id of g.fighterIds) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
    for (const id of leftover) {
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
    expect(seen.size).toBe(fighters.length); // everyone is either grouped or a leftover
  });

  it('a 5-year-old and a 20-year-old are never in the same group', () => {
    const fighters: FighterForGrouping[] = [
      { id: 1, firstName: 'Kid', lastName: 'A', gender: 'M', age: 5, weight: 20, rankId: 1, rankName: 'W', rankOrder: 0, school: null },
      { id: 2, firstName: 'Kid', lastName: 'B', gender: 'M', age: 6, weight: 22, rankId: 1, rankName: 'W', rankOrder: 0, school: null },
      { id: 3, firstName: 'Kid', lastName: 'C', gender: 'M', age: 6, weight: 24, rankId: 1, rankName: 'W', rankOrder: 0, school: null },
      { id: 4, firstName: 'Adult', lastName: 'A', gender: 'M', age: 20, weight: 70, rankId: 1, rankName: 'W', rankOrder: 0, school: null },
      { id: 5, firstName: 'Adult', lastName: 'B', gender: 'M', age: 20, weight: 72, rankId: 1, rankName: 'W', rankOrder: 0, school: null },
      { id: 6, firstName: 'Adult', lastName: 'C', gender: 'M', age: 20, weight: 74, rankId: 1, rankName: 'W', rankOrder: 0, school: null },
    ];
    const { groups } = proposeLocal(fighters, DEFAULT_AI_SETTINGS);
    for (const g of groups) {
      const ages = g.fighterIds.map((id) => fighters.find((f) => f.id === id)!.age);
      expect(Math.max(...ages) - Math.min(...ages)).toBeLessThan(14);
    }
  });

  it('leaves a lone pair as leftover instead of auto-creating a 2-fighter group', () => {
    const fighters = makeFighters(2, 9, 1); // two 9-year-olds
    const { groups, leftover } = proposeLocal(fighters, DEFAULT_AI_SETTINGS);
    expect(groups).toHaveLength(0);
    expect(leftover.sort()).toEqual([1, 2]);
  });
});
