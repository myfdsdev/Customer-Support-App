import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { LayoutGrid, Package, LifeBuoy, ChevronDown, LogOut, User as UserIcon } from 'lucide-react';
import cn from '../../utils/cn';
import { usePortalAuth } from '../../context/PortalAuthContext';
import { Avatar } from '../ui';
import NotificationMenu from './NotificationMenu';

/**
 * Top navigation for the customer portal — no left sidebar, by design.
 *
 * Collapses to a hamburger-free horizontal scroll on mobile: the four
 * destinations always stay reachable without a menu, which is friendlier on a
 * phone than hiding them behind a toggle.
 */
const LINKS = [
  { to: '/portal/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { to: '/portal/products', label: 'My Products', icon: Package },
  { to: '/portal/support', label: 'Support', icon: LifeBuoy },
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
    <header className="sticky top-0 z-20 border-b border-ink-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        {/* Brand */}
        <Link to="/portal/dashboard" className="flex shrink-0 items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 font-bold text-ink-900">Y</span>
          <span className="hidden text-base font-semibold text-ink-900 sm:block">YourLogo</span>
        </Link>

        {/* Primary nav */}
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scroll-thin px-1">
          {LINKS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-600 hover:bg-ink-100'
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Right cluster */}
        <div className="flex shrink-0 items-center gap-1">
          <NotificationMenu />

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-ink-100"
            >
              <Avatar name={customer?.name || customer?.email} size="sm" />
              <span className="hidden max-w-[120px] truncate text-sm font-medium text-ink-800 sm:block">
                {customer?.firstName || customer?.name || 'Account'}
              </span>
              <ChevronDown className="h-4 w-4 text-ink-400" />
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
