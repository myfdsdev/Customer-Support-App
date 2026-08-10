import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Inbox, Ticket, Users, Package, BookOpen, GraduationCap,
  Megaphone, Bell, UsersRound, BarChart3, Settings, LogOut, Menu, X, LifeBuoy, ChevronDown,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { conversationService } from '../services/endpoints';
import { Avatar, Badge } from '../components/ui';
import { humanize } from '../utils/format';
import cn from '../utils/cn';

const NAV = [
  { section: null, items: [{ to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard' }] },
  {
    section: 'Support',
    items: [
      { to: '/admin/inbox', label: 'Inbox', icon: Inbox, perm: 'inbox', badge: 'unassigned' },
      { to: '/admin/tickets', label: 'Tickets', icon: Ticket, perm: 'tickets' },
    ],
  },
  {
    section: null,
    items: [
      { to: '/admin/customers', label: 'Customers', icon: Users, perm: 'customers' },
      { to: '/admin/products', label: 'Products', icon: Package, perm: 'products' },
      { to: '/admin/knowledge', label: 'Knowledge Base', icon: BookOpen, perm: 'knowledge' },
      { to: '/admin/training', label: 'Training Videos', icon: GraduationCap, perm: 'training' },
    ],
  },
  {
    section: 'Marketing',
    items: [
      { to: '/admin/marketing', label: 'Recommendations', icon: Megaphone, perm: 'marketing' },
      { to: '/admin/announcements', label: 'Announcements', icon: Bell, perm: 'announcements' },
    ],
  },
  {
    section: null,
    items: [
      { to: '/admin/team', label: 'Team', icon: UsersRound, perm: 'team' },
      { to: '/admin/analytics', label: 'Analytics', icon: BarChart3, perm: 'analytics' },
      { to: '/admin/settings', label: 'Settings', icon: Settings, perm: 'settings' },
    ],
  },
];

export default function AdminLayout() {
  const { user, logout, can, socket } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [counts, setCounts] = useState({ unassigned: 0 });

  useEffect(() => setOpen(false), [location.pathname]);

  // Live badge on the Inbox item — refreshed on any conversation event so the
  // sidebar never lies about how much work is waiting.
  useEffect(() => {
    if (!can('inbox')) return undefined;

    const refresh = () => conversationService.counts().then(setCounts).catch(() => null);
    refresh();

    const interval = setInterval(refresh, 60000);
    const events = ['conversation:new', 'conversation:handoff', 'conversation:assigned', 'conversation:resolved', 'conversation:updated'];
    events.forEach((e) => socket?.on(e, refresh));

    return () => {
      clearInterval(interval);
      events.forEach((e) => socket?.off(e, refresh));
    };
  }, [socket, can]);

  const sections = NAV.map((group) => ({
    ...group,
    items: group.items.filter((i) => can(i.perm)),
  })).filter((g) => g.items.length);

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  const sidebar = (
    <div className="flex h-full flex-col bg-ink-900 text-ink-300">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
          <LifeBuoy className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">Support Platform</p>
          <p className="text-[11px] text-ink-500">Multi-product</p>
        </div>
        <button onClick={() => setOpen(false)} className="ml-auto text-ink-400 lg:hidden" aria-label="Close menu">
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto scroll-thin px-3 pb-4">
        {sections.map((group, gi) => (
          <div key={gi}>
            {group.section && (
              <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-ink-600">{group.section}</p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                      isActive ? 'bg-ink-800 text-white' : 'text-ink-400 hover:bg-ink-800/60 hover:text-ink-100'
                    )
                  }
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.badge === 'unassigned' && counts.unassigned > 0 && (
                    <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {counts.unassigned}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-ink-800 p-3">
        <div className="relative">
          <button
            onClick={() => setMenu((m) => !m)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-ink-800"
          >
            <Avatar name={user?.name} src={user?.avatar} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{user?.name}</p>
              <p className="truncate text-[11px] text-ink-500">{humanize(user?.role)}</p>
            </div>
            <ChevronDown className={cn('h-4 w-4 text-ink-500 transition-transform', menu && 'rotate-180')} />
          </button>

          {menu && (
            <div className="absolute bottom-full left-0 right-0 mb-1 overflow-hidden rounded-lg border border-ink-700 bg-ink-800 shadow-pop">
              <button
                onClick={() => {
                  setMenu(false);
                  navigate('/admin/settings');
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ink-300 hover:bg-ink-700"
              >
                <Settings className="h-4 w-4" /> Settings
              </button>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-ink-700"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-ink-50">
      <aside className="hidden w-60 shrink-0 lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-900/50" onClick={() => setOpen(false)} />
          <aside className="relative h-full w-64">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-ink-200 bg-white px-4 py-2.5 lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-lg p-1.5 text-ink-600 hover:bg-ink-100" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <p className="text-sm font-semibold text-ink-900">Support Platform</p>
          {counts.unassigned > 0 && <Badge tone="indigo" className="ml-auto">{counts.unassigned} new</Badge>}
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto scroll-thin">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
