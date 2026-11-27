'use client';
// What the signed-in user may do in the active tenant (from GET /tenant). Screens hide what is not allowed;
// the API enforces the same rules.
import { useQuery } from '@tanstack/react-query';
import { tenantApi } from './api';

export interface Perms { admin: boolean; integrate: boolean; write: boolean; approve: boolean; tune: boolean; role?: string }
const NONE: Perms = { admin: false, integrate: false, write: false, approve: false, tune: false };

export function usePerms(): Perms {
  const { data } = useQuery({ queryKey: ['tenant'], queryFn: tenantApi.current, staleTime: 60_000 });
  return data?.perms ? { tune: false, ...data.perms, role: data.role } : NONE;
}

/** The environment this studio runs in (QA, UAT, PRODUCTION). Production is read-only except live parameters and rollback. */
export function useEnvironment(): { name: string; production: boolean } {
  const { data } = useQuery({ queryKey: ['tenant'], queryFn: tenantApi.current, staleTime: 60_000 });
  const raw = String((data as any)?.environment || '').toUpperCase();
  const production = raw === 'PROD' || raw === 'PRODUCTION';
  return { name: production ? 'PRODUCTION' : raw, production };
}
