import React, { useState } from 'react';
import { Input, Button, Alert } from '../../components/ui';
import { portalService, toMessage } from '../../services/portalApi';
import { usePortalAuth } from '../../context/PortalAuthContext';

export default function Profile() {
  const { customer, refresh } = usePortalAuth();
  const [form, setForm] = useState({
    name: customer?.name || '',
    phone: customer?.phone || '',
    timezone: customer?.timezone || '',
  });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setNotice('');
    setError('');
    setBusy(true);
    try {
      await portalService.updateProfile(form);
      await refresh();
      setNotice('Your profile has been updated.');
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold text-ink-900">Profile</h1>
      <p className="mt-1 text-ink-500">Manage your account details.</p>

      <form onSubmit={submit} className="card mt-6 space-y-4 p-6">
        {notice && <Alert tone="success">{notice}</Alert>}
        {error && <Alert tone="error">{error}</Alert>}

        <Input label="Email" value={customer?.email || ''} disabled hint="Contact support to change your email." />
        <Input label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <Input
          label="Timezone"
          value={form.timezone}
          placeholder="e.g. America/New_York"
          onChange={(e) => setForm({ ...form, timezone: e.target.value })}
        />
        <div className="flex justify-end">
          <Button type="submit" loading={busy}>
            Save changes
          </Button>
        </div>
      </form>
    </div>
  );
}
