// Shared domain constants and helper types used across the backend.

export type Role = 'admin' | 'tatami_editor' | 'viewer';
export const ROLES: Role[] = ['admin', 'tatami_editor', 'viewer'];

export type Discipline = 'kumite' | 'kata';
export const DECISIONS = [
  'ippon',
  'waza-ari',
  'hantei',
  'shikkaku',
  'kiken',
  'walkover',
] as const;
export type Decision = (typeof DECISIONS)[number];

export type MatchStatus = 'pending' | 'ready' | 'done' | 'bye';

// A single extension/round entry recorded on a match before a winner is set.
export interface ExtensionEntry {
  round: number; // 1 = first extension, etc.
  scoreA?: number;
  scoreB?: number;
  note?: string;
}

export interface AuthUser {
  id: number;
  username: string;
  role: Role;
  displayName?: string | null;
  tatamiIds: number[];
}

// AI grouping settings persisted in AppSetting under key "ai".
export interface AiSettings {
  provider: 'local' | 'claude' | 'openai' | 'gemini';
  apiKey?: string;
  model?: string;
  // Local-engine band configuration (also passed to LLM as guidance).
  ageBand: number; // years per age band
  weightBand: number; // kg per weight band
  rankBand: number; // ranks grouped per band (by seniority order)
  avoidSameSchool: boolean;
  maxGroupSize: number; // hard cap, <= 8
  minGroupSize: number; // >= 2
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: 'local',
  model: '',
  ageBand: 3,
  weightBand: 5,
  rankBand: 2,
  avoidSameSchool: true,
  maxGroupSize: 8,
  minGroupSize: 3, // never auto-create a 2-fighter group (those are manual "special bouts")
};
