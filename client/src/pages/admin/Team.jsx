import React, { useEffect, useState } from 'react';
import { Plus, UsersRound, Pencil, Trash2 } from 'lucide-react';
import { authService, productService } from '../../services/endpoints';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/admin/PageHeader';
import { Button, Input, Select, Modal, Badge, Spinner, EmptyState, Avatar, PresenceDot } from '../../components/ui';
import { humanize, timeAgo } from '../../utils/format';

const ROLES = [
  { value: 'super_admin', label: 'Super Admin', hint: 'Full access to everything.' },
  { value: 'support_manager', label: 'Support Manager', hint: 'Support, customers, products, knowledge, analytics.' },
  { value: 'support_agent', label: 'Support Agent', hint: 'Inbox, tickets, customers, knowledge, training.' },
  { value: 'marketing_manager', label: 'Marketing Manager', hint: 'Recommendations, announcements, marketing analytics.' },
];

const EMPTY = { name: '', email: '', password: '', role: 'support_agent', title: '', productIds: [] };

export default function Team() {
  const toast = useToast();
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = () => authService.listUsers().then(setUsers).finally(() => setLoading(false));

  useEffect(() => {
    load();
    productService.list().then(setProducts).catch(() => null);
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  };

  const openEdit = (u) => {
    setEditing(u);
    setForm({
      name: u.name,
      email: u.email,
      password: '',
      role: u.role,
      title: u.title || '',
      status: u.status,
      productIds: (u.products || []).map((p) => p._id),
    });
    setOpen(true);
  };

  async function submit() {
    setSaving(true);
    try {
      if (editing) {
        const payload = { ...form };
        if (!payload.password) delete payload.password;
        delete payload.email; // email changes need their own flow
        await authService.updateUser(editing._id, payload);
        toast.success('Team member updated');
      } else {
        await authService.createUser(form);
        toast.success('Team member added');
      }
      setOpen(false);
      load();
    } catch (err) {
      toast.error(err.friendlyMessage);
    } finally {
      setSaving(false);
    }
  }

  async function remove(u) {
    if (!window.confirm(`Remove ${u.name} from the team?`)) return;
    try {
      await authService.deleteUser(u._id);
      toast.success('Removed');
      load();
    } catch (err) {
      toast.error(err.friendlyMessage);
    }
  }

  const toggleProduct = (id) =>
    setForm((f) => ({
      ...f,
      productIds: f.productIds.includes(id) ? f.productIds.filter((x) => x !== id) : [...f.productIds, id],
    }));

  return (
    <div>
      <PageHeader
        title="Team"
        description="Roles decide what each person can reach. Product assignment decides which conversations they see."
        actions={<Button onClick={openNew}><Plus className="h-4 w-4" /> Add team member</Button>}
      />

      <div className="p-4 sm:p-6">
        {loading ? (
          <Spinner />
        ) : users.length === 0 ? (
          <EmptyState icon={UsersRound} title="No team members" />
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-ink-200 bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Member</th>
                    <th className="px-4 py-2.5 font-semibold">Role</th>
                    <th className="px-4 py-2.5 font-semibold">Products</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold">Last seen</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {users.map((u) => (
                    <tr key={u._id} className="hover:bg-ink-50">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="relative">
                            <Avatar name={u.name} src={u.avatar} size="sm" />
                            <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white p-[2px]">
                              <PresenceDot status={u.isOnline ? 'online' : 'offline'} />
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink-900">
                              {u.name}
                              {String(u._id) === String(user?._id) && <span className="ml-1 text-xs text-ink-400">(you)</span>}
                            </p>
                            <p className="truncate text-xs text-ink-500">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5"><Badge tone="indigo">{humanize(u.role)}</Badge></td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {(u.products || []).length === 0 ? (
                            <span className="text-xs text-ink-400">All products</span>
                          ) : (
                            u.products.map((p) => <Badge key={p._id} tone="gray">{p.name}</Badge>)
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={u.status === 'active' ? 'green' : 'gray'}>{humanize(u.status)}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-ink-400">{u.lastSeenAt ? timeAgo(u.lastSeenAt) : '—'}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => openEdit(u)} className="rounded p-1.5 text-ink-400 hover:bg-ink-100" title="Edit">
                            <Pencil className="h-4 w-4" />
                          </button>
                          {String(u._id) !== String(user?._id) && (
                            <button onClick={() => remove(u)} className="rounded p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600" title="Remove">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Add team member'}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} loading={saving} disabled={!form.name.trim() || (!editing && (!form.email || form.password.length < 8))}>
              {editing ? 'Save changes' : 'Add member'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Full name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              disabled={Boolean(editing)}
            />
            <Input label="Job title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Support agent" />
            <Input
              label={editing ? 'New password (leave blank to keep)' : 'Password'}
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              hint="At least 8 characters."
            />
          </div>

          <div>
            <Select label="Role" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-ink-500">{ROLES.find((r) => r.value === form.role)?.hint}</p>
          </div>

          {editing && (
            <Select label="Status" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              {['active', 'inactive', 'suspended'].map((s) => (
                <option key={s} value={s}>{humanize(s)}</option>
              ))}
            </Select>
          )}

          <div>
            <p className="label">Product access</p>
            <div className="flex flex-wrap gap-2">
              {products.map((p) => (
                <button
                  key={p._id}
                  type="button"
                  onClick={() => toggleProduct(p._id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    form.productIds.includes(p._id)
                      ? 'border-brand-600 bg-brand-50 text-brand-700'
                      : 'border-ink-200 bg-white text-ink-600'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-ink-500">
              Select none for access to all products. Managers and admins always see everything.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
