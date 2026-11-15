'use client';
// What the signed-in user may do in the active tenant (from GET /tenant). Screens hide what is not allowed;
// the API enforces the same rules.
import { useQuery } from '@tanstack/react-query';
import { tenantApi } from './api';

export interface Perms { admin: boolean; integrate: boolean; write: boolean; approve: boolean; role?: string }
const NONE: Perms = { admin: false, integrate: false, write: false, approve: false };

export function usePerms(): Perms {
  const { data } = useQuery({ queryKey: ['tenant'], queryFn: tenantApi.current, staleTime: 60_000 });
  return data?.perms ? { ...data.perms, role: data.role } : NONE;
}
