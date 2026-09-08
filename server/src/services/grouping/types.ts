export interface FighterForGrouping {
  id: number;
  firstName: string;
  lastName: string;
  gender: string | null; // "M" | "F" | null
  age: number;
  weight: number;
  rankId: number;
  rankName: string;
  rankOrder: number;
  school: string | null;
}

export interface ProposedGroup {
  name: string;
  discipline: 'kumite' | 'kata';
  gender: string | null;
  ageMin: number;
  ageMax: number;
  weightMin: number;
  weightMax: number;
  rankIds: number[];
  fighterIds: number[];
}

export interface GroupingResult {
  provider: string;
  groups: ProposedGroup[];
  warnings: string[];
  usedFallback: boolean;
  ungrouped?: number; // fighters left for manual "special bouts" (couldn't form a group of 3+)
}
