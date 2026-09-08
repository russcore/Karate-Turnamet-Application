import { describe, expect, it } from 'vitest';
import { validateRows, type RankIndex } from '../src/services/import.js';
import type { CanonicalField } from '../src/services/import.js';

const rankIndex: RankIndex = { byKey: new Map([['green', 5], ['white', 1]]) };
const mapping: Partial<Record<CanonicalField, string>> = Object.fromEntries(
  ['first_name', 'last_name', 'school', 'rank', 'age', 'weight', 'gender'].map((f) => [f, f]),
) as any;

describe('import validation', () => {
  it('flags unknown ranks, non-numeric age/weight and missing required fields by row number', () => {
    const rows = [
      { first_name: 'Ivan', last_name: 'Petrov', school: 'A', rank: 'green', age: '12', weight: '38', gender: 'M' },
      { first_name: 'Bad', last_name: 'Rank', school: 'B', rank: 'purple', age: '10', weight: '30', gender: 'F' },
      { first_name: 'No', last_name: 'Age', school: 'C', rank: 'white', age: 'abc', weight: '30', gender: 'M' },
      { first_name: '', last_name: 'Missing', school: 'D', rank: 'white', age: '9', weight: '25', gender: 'F' },
    ];
    const result = validateRows(rows, mapping, rankIndex);

    expect(result.rows[0].errors).toHaveLength(0);
    expect(result.rows[0].rankId).toBe(5);
    expect(result.rows[0].index).toBe(1);

    expect(result.rows[1].errors.join()).toContain('Unknown rank');
    expect(result.unknownRanks).toContain('purple');

    expect(result.rows[2].errors.join()).toContain('Invalid age');

    expect(result.rows[3].errors.join()).toContain('Missing first_name');

    expect(result.errorCount).toBe(3);
    expect(result.okCount).toBe(1);
  });

  it('marks duplicate first+last+school as a warning, not a hard error', () => {
    const rows = [
      { first_name: 'Ivan', last_name: 'Petrov', school: 'A', rank: 'green', age: '12', weight: '38', gender: 'M' },
      { first_name: 'Ivan', last_name: 'Petrov', school: 'A', rank: 'green', age: '12', weight: '38', gender: 'M' },
    ];
    const result = validateRows(rows, mapping, rankIndex);
    expect(result.rows[1].warnings.join()).toContain('duplicate');
    expect(result.rows[1].errors).toHaveLength(0);
  });

  it('maps unknown ranks when a manual mapping is supplied', () => {
    const rows = [{ first_name: 'A', last_name: 'B', school: 'C', rank: 'изумрудный', age: '11', weight: '33', gender: 'M' }];
    const result = validateRows(rows, mapping, rankIndex, { 'изумрудный': 5 });
    expect(result.rows[0].errors).toHaveLength(0);
    expect(result.rows[0].rankId).toBe(5);
  });
});
