import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LifeBuoy, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/endpoints';
import { setToken, toMessage } from '../../services/api';
import { Button, Input, Alert } from '../../components/ui';

/**
 * Sign-in, plus first-run setup. On an empty install there is no admin to log
 * in as, so the same screen creates the first super admin instead.
 */
export default function Login() {
  const { login, isAuthenticated, setUser } = useAuth();
  const navigate = useNavigate();

  const [needsSetup, setNeedsSetup] = useState(false);
  const [checking, setChecking] = useState(true);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // "/admin" resolves to the first section this role can actually reach —
  // a support agent has no dashboard, so hard-coding it would 403 them on login.
  useEffect(() => {
    if (isAuthenticated) navigate('/admin', { replace: true });
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    authService
      .setupState()
      .then((d) => setNeedsSetup(Boolean(d.needsSetup)))
      .catch(() => setNeedsSetup(false))
      .finally(() => setChecking(false));
  }, []);

  const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (needsSetup) {
        const data = await authService.bootstrap(form);
        setToken(data.token);
        setUser(data.user);
        // Full reload so AuthProvider re-runs /auth/me and opens the socket.
        window.location.href = '/admin';
        return;
      }
      await login(form.email, form.password);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50">
        <Loader2 className="h-6 w-6 animate-spin text-ink-400" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white">
            <LifeBuoy className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-ink-900">
            {needsSetup ? 'Create your admin account' : 'Sign in to Support Platform'}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {needsSetup
              ? 'This is a fresh install. The first account becomes the super admin.'
              : 'Manage support across all of your products.'}
          </p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6">
          {error && <Alert tone="error">{error}</Alert>}

          {needsSetup && (
            <Input label="Full name" name="name" value={form.name} onChange={change} required placeholder="Jane Doe" autoComplete="name" />
          )}

          <Input
            label="Email"
            name="email"
            type="email"
            value={form.email}
            onChange={change}
            required
            placeholder="you@company.com"
            autoComplete="email"
          />

          <Input
            label="Password"
            name="password"
            type="password"
            value={form.password}
            onChange={change}
            required
            placeholder="••••••••"
            autoComplete={needsSetup ? 'new-password' : 'current-password'}
            hint={needsSetup ? 'At least 8 characters.' : undefined}
          />

          <Button type="submit" loading={busy} className="w-full">
            {needsSetup ? 'Create account' : 'Sign in'}
          </Button>
        </form>

        {!needsSetup && (
          <p className="mt-4 text-center text-xs text-ink-400">
            Seeded demo accounts are listed in the README.
          </p>
        )}
      </div>
    </div>
  );
}
