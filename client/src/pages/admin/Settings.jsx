import React, { useEffect, useState } from 'react';
import { Save, KeyRound, Bot, Database, CheckCircle2, XCircle } from 'lucide-react';
import { authService, dashboardService } from '../../services/endpoints';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/admin/PageHeader';
import { Button, Input, Badge, Alert, Avatar } from '../../components/ui';
import { humanize } from '../../utils/format';

export default function Settings() {
  const { user, setUser } = useAuth();
  const toast = useToast();

  const [profile, setProfile] = useState({ name: '', title: '', avatar: '' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [health, setHealth] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (user) setProfile({ name: user.name || '', title: user.title || '', avatar: user.avatar || '' });
  }, [user]);

  useEffect(() => {
    dashboardService.health().then(setHealth).catch(() => null);
  }, []);

  async function saveProfile() {
    setSavingProfile(true);
    try {
      const updated = await authService.updateProfile(profile);
      setUser(updated);
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err.friendlyMessage);
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword() {
    if (passwords.newPassword !== passwords.confirm) return toast.error('New passwords do not match');
    if (passwords.newPassword.length < 8) return toast.error('Password must be at least 8 characters');
    setSavingPassword(true);
    try {
      await authService.changePassword({
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      setPasswords({ currentPassword: '', newPassword: '', confirm: '' });
      toast.success('Password changed');
    } catch (err) {
      toast.error(err.friendlyMessage);
    } finally {
      setSavingPassword(false);
    }
    return undefined;
  }

  const Status = ({ ok, children }) => (
    <span className={`inline-flex items-center gap-1.5 text-sm ${ok ? 'text-emerald-700' : 'text-ink-500'}`}>
      {ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
      {children}
    </span>
  );

  return (
    <div>
      <PageHeader title="Settings" description="Your account, and how the platform is configured." />

      <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-2">
        {/* Profile */}
        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-ink-900">Your profile</h2>
          <div className="mb-4 flex items-center gap-3">
            <Avatar name={profile.name} src={profile.avatar} size="lg" />
            <div>
              <p className="font-medium text-ink-900">{user?.name}</p>
              <p className="text-xs text-ink-500">{user?.email}</p>
              <Badge tone="indigo" className="mt-1">{humanize(user?.role)}</Badge>
            </div>
          </div>
          <div className="space-y-3">
            <Input label="Name" value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} />
            <Input label="Job title" value={profile.title} onChange={(e) => setProfile((p) => ({ ...p, title: e.target.value }))} />
            <Input label="Avatar URL" value={profile.avatar} onChange={(e) => setProfile((p) => ({ ...p, avatar: e.target.value }))} />
            <Button onClick={saveProfile} loading={savingProfile}>
              <Save className="h-4 w-4" /> Save profile
            </Button>
          </div>
        </div>

        {/* Password */}
        <div className="card p-5">
          <h2 className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-ink-900">
            <KeyRound className="h-4 w-4" /> Change password
          </h2>
          <div className="space-y-3">
            <Input
              label="Current password"
              type="password"
              value={passwords.currentPassword}
              onChange={(e) => setPasswords((p) => ({ ...p, currentPassword: e.target.value }))}
              autoComplete="current-password"
            />
            <Input
              label="New password"
              type="password"
              value={passwords.newPassword}
              onChange={(e) => setPasswords((p) => ({ ...p, newPassword: e.target.value }))}
              autoComplete="new-password"
              hint="At least 8 characters."
            />
            <Input
              label="Confirm new password"
              type="password"
              value={passwords.confirm}
              onChange={(e) => setPasswords((p) => ({ ...p, confirm: e.target.value }))}
              autoComplete="new-password"
            />
            <Button
              onClick={changePassword}
              loading={savingPassword}
              disabled={!passwords.currentPassword || !passwords.newPassword}
            >
              Update password
            </Button>
          </div>
        </div>

        {/* System */}
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-ink-900">System</h2>

          {health ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-ink-200 p-4">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-ink-900">
                  <Bot className="h-4 w-4 text-brand-700" /> AI provider
                </p>
                <Status ok={health.ai.enabled}>
                  {health.ai.enabled ? `Gemini connected (${health.ai.model})` : 'Gemini not configured'}
                </Status>
                {!health.ai.enabled && (
                  <p className="mt-2 text-xs text-ink-500">
                    Add <code>GEMINI_API_KEY</code> to <code>server/.env</code> and restart. Answers currently come from
                    keyword retrieval, quoted directly from your knowledge base.
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-ink-200 p-4">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-ink-900">
                  <Database className="h-4 w-4 text-brand-700" /> Retrieval
                </p>
                <Status ok={health.retrieval.atlasUsable}>
                  {health.retrieval.atlasUsable
                    ? `Atlas Vector Search (${health.retrieval.indexName})`
                    : 'In-process similarity / keyword search'}
                </Status>
                {!health.retrieval.atlasUsable && (
                  <p className="mt-2 text-xs text-ink-500">
                    Create a vector index named <code>{health.retrieval.indexName}</code> on the{' '}
                    <code>knowledgechunks</code> collection in Atlas, then set{' '}
                    <code>ATLAS_VECTOR_SEARCH=true</code>. Retrieval works either way.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <Alert tone="warning">Could not read system status.</Alert>
          )}

          <div className="mt-4 rounded-lg bg-ink-50 p-4">
            <p className="text-xs font-medium text-ink-700">Secrets stay on the server</p>
            <p className="mt-1 text-xs text-ink-500">
              The Gemini API key and the MongoDB connection string live in <code>server/.env</code> and are never sent to
              the browser. This page only reports whether they are present.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
