'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';
import { authApi } from '@/lib/api';
import { useAuth } from '@/lib/store';

export default function SignupPage() {
  const router = useRouter();
  const setAuth = useAuth((s) => s.setAuth);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await authApi.signup({ name, email, password, workspaceName });
      const tenant = res.workspace?.slug || 'default';
      setAuth(res.token, res.user, res.workspace);
      router.push(`/${tenant}`);
    } catch (e: any) {
      setError(e.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg bg-dot-pattern bg-dot flex items-center justify-center p-6">
      <div className="card w-full max-w-md p-8 space-y-6">
        <div className="flex items-center gap-2.5">
          <Logo className="h-8 w-8" />
          <span className="font-bold text-lg">XRules</span>
        </div>

        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Create account</h1>
          <p className="text-sm text-subtle font-mono">spin up a new workspace</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label-section block mb-1.5">Your name</label>
            <input required className="input w-full" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label-section block mb-1.5">Workspace name</label>
            <input required className="input w-full" value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} />
          </div>
          <div>
            <label className="label-section block mb-1.5">Email</label>
            <input type="email" required className="input w-full" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label-section block mb-1.5">Password</label>
            <input type="password" required minLength={8} className="input w-full" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          {error && <div className="pill pill-danger">{error}</div>}

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center disabled:opacity-50">
            {loading ? 'Creating…' : 'Create account'}
          </button>
        </form>

        <div className="text-center text-sm text-subtle">
          Already have an account? <Link href="/login" className="text-accent hover:underline">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
