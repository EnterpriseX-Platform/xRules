'use client';
// The Developer switch: business people see topics, words and approvals; developers also see rules, flows, data,
// APIs and monitoring. Remembered per browser; developers (integrators, admins) start with it on.
import { useEffect, useState } from 'react';
import { usePerms } from './perms';

const KEY = 'xr-developer-view';
export function useDevMode(): [boolean, (v: boolean) => void] {
  const perms = usePerms();
  const [v, setV] = useState<boolean | null>(null);
  useEffect(() => {
    const read = () => { try { const s = localStorage.getItem(KEY); setV(s === null ? null : s === '1'); } catch { setV(null); } };
    read(); window.addEventListener('xr-devmode', read); return () => window.removeEventListener('xr-devmode', read);
  }, []);
  const on = v ?? perms.integrate;
  const set = (n: boolean) => { try { localStorage.setItem(KEY, n ? '1' : '0'); } catch {} setV(n); window.dispatchEvent(new Event('xr-devmode')); };
  return [on, set];
}
