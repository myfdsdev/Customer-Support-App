import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Input, Button, Alert } from '../../components/ui';
import { portalAuthService, setPortalToken, toMessage } from '../../services/portalApi';
import { usePortalAuth } from '../../context/PortalAuthContext';
import AuthShell from './AuthShell';

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { refresh } = usePortalAuth();
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (form.password !== form.confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const data = await portalAuthService.resetPassword({ token, password: form.password });
      if (data.token) setPortalToken(data.token);
      await refresh();
      navigate('/portal/dashboard', { replace: true });
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Set a new password"
      footer={
        <Link to="/login" className="font-medium text-brand-700 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Input
          label="New password"
          type="password"
          name="password"
          autoComplete="new-password"
          required
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <Input
          label="Confirm password"
          type="password"
          name="confirm"
          autoComplete="new-password"
          required
          value={form.confirm}
          onChange={(e) => setForm({ ...form, confirm: e.target.value })}
        />
        <Button type="submit" loading={busy} className="w-full justify-center">
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}
