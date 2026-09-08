import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface EventBranding {
  id: number;
  title: string;
  subtitle: string | null;
  logoPath: string | null;
  accentColor: string;
  topBarColor: string;
  bronzeMode: 'single' | 'double';
  defaultTatamiImage: string | null;
  cornerAName: string;
  cornerAColor: string;
  cornerBName: string;
  cornerBColor: string;
}

export interface Tatami {
  id: number;
  name: string;
  imagePath: string | null;
  order: number;
  enabled: boolean;
}

export interface Rank {
  id: number;
  name: string;
  beltColor: string;
  stripeColor: string | null;
  stripeCount: number;
  order: number;
  shortCode: string | null;
  aliases: { id: number; value: string }[];
  inUse: number;
}

export function useEvent() {
  return useQuery<EventBranding>({ queryKey: ['event'], queryFn: () => api.get('/api/event') });
}
export function useTatamis() {
  return useQuery<Tatami[]>({ queryKey: ['tatami'], queryFn: () => api.get('/api/tatami') });
}
export function useRanks() {
  return useQuery<Rank[]>({ queryKey: ['ranks'], queryFn: () => api.get('/api/ranks') });
}
