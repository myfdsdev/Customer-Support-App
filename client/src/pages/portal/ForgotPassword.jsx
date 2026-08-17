import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Input, Button, Alert } from '../../components/ui';
import { portalAuthService, toMessage } from '../../services/portalApi';
import AuthShell from './AuthShell';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await portalAuthService.forgotPassword(email.trim());
      setDone(true);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We’ll email you a link to set a new one"
      footer={
        <Link to="/login" className="font-medium text-brand-700 hover:underline">
          Back to sign in
        </Link>
      }
    >
      {done ? (
        <Alert tone="success">
          If that email has an account, a reset link is on its way. Check your inbox and spam folder.
        </Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Input
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" loading={busy} className="w-full justify-center">
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
