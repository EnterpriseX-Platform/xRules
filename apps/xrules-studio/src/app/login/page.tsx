'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';
import { authApi } from '@/lib/api';
import { useAuth } from '@/lib/store';

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuth((s) => s.setAuth);
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await authApi.login(email, password);
      const tenant = res.user?.tenantId || 'default';
      setAuth(
        res.access_token || res.token,
        res.user,
        res.workspace || { id: '', slug: tenant, name: tenant },
        res.refresh_token,
      );
      const next = new URLSearchParams(window.location.search).get('next');
      router.push(next || `/`);
    } catch (e: any) {
      setError(e.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6">
      <div className="card w-full max-w-md p-8 space-y-6 relative">
        <div className="flex items-center gap-2.5">
          <Logo className="h-8 w-8" />
          <span className="text-lg font-semibold tracking-tight">
            XRULES<span className="text-accent">.io</span>
          </span>
          <span className="ml-auto pill pill-info text-[9px]">BETA</span>
        </div>

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm text-subtle">Open-source decision management platform</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label-section block mb-1.5">Email</label>
            <input
              type="email"
              required
              className="input w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="label-section block mb-1.5">Password</label>
            <input
              type="password"
              required
              className="input w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div className="pill pill-danger">{error}</div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center disabled:opacity-50">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="text-center text-sm text-subtle">
          No account?{' '}
          <Link href="/signup" className="text-accent hover:underline">Sign up</Link>
        </div>

        <div className="text-[10px] font-mono text-subtle/60 text-center pt-4 border-t border-border">
          DEMO · admin@example.com / admin123
        </div>
      </div>
    </div>
  );
}
