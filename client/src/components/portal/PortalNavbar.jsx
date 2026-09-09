import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { LayoutGrid, Package, LifeBuoy, Ticket, ChevronDown, LogOut, User as UserIcon } from 'lucide-react';
import cn from '../../utils/cn';
import { usePortalAuth } from '../../context/PortalAuthContext';
import { Avatar } from '../ui';
import NotificationMenu from './NotificationMenu';

/**
 * Top navigation for the customer portal — "Fly Support" branding, a centred
 * pill nav, and the notification + account cluster on the right. No left
 * sidebar, by design (a flat, top-nav SaaS layout).
 */
const LINKS = [
  { to: '/portal/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { to: '/portal/products', label: 'My Products', icon: Package },
  { to: '/portal/support', label: 'Support', icon: LifeBuoy },
  { to: '/portal/tickets', label: 'Tickets', icon: Ticket },
];

export default function PortalNavbar() {
  const { customer, logout } = usePortalAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-20 border-b border-ink-200/70 bg-white/95 backdrop-blur">
      {/* Accent strip across the very top (full-bleed) — radial white→lime */}
      <div className="navbar-accent-bar h-1.5 w-full" />
      <div className="mx-auto flex h-20 max-w-[1600px] items-center gap-6 px-4 sm:px-6 lg:gap-10">
        {/* Brand */}
        <Link to="/portal/dashboard" className="flex shrink-0 items-center">
          <img src="/images/brand/fly-support-logo.png" alt="Fly Support" className="h-8 w-auto" />
        </Link>

        {/* Primary nav — grouped beside the brand (left of centre, per design) */}
        <nav className="flex min-w-0 items-center gap-1 overflow-x-auto scroll-thin sm:gap-2">
          {LINKS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-colors sm:px-5',
                  isActive
                    ? 'bg-brand-50 text-brand-800'
                    : 'text-ink-700 hover:bg-ink-100 hover:text-ink-900'
                )
              }
            >
              <Icon className={cn('h-[18px] w-[18px]')} />
              <span className="hidden sm:inline">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Right cluster — pushed to the far right */}
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <NotificationMenu />

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-full p-1 pr-2 hover:bg-ink-100"
            >
              <Avatar name={customer?.name || customer?.email} size="sm" />
              <span className="hidden max-w-[140px] truncate text-sm font-medium text-ink-800 sm:block">
                {customer?.firstName || customer?.name || 'Account'}
              </span>
              <ChevronDown className="hidden h-4 w-4 text-ink-400 sm:block" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-pop">
                <div className="border-b border-ink-100 px-4 py-3">
                  <p className="truncate text-sm font-semibold text-ink-900">{customer?.name || 'Your account'}</p>
                  <p className="truncate text-xs text-ink-500">{customer?.email}</p>
                </div>
                <Link
                  to="/portal/profile"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm text-ink-700 hover:bg-ink-50"
                >
                  <UserIcon className="h-4 w-4" /> Profile
                </Link>
                <button
                  type="button"
                  onClick={onLogout}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
