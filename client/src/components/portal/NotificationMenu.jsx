import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import cn from '../../utils/cn';
import { portalService } from '../../services/portalApi';
import { timeAgo } from '../../utils/format';

/**
 * Bell menu backed by real notification rows. Unread count is fetched on mount
 * and refreshed when the menu opens, so the badge survives refresh and login.
 */
export default function NotificationMenu() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const data = await portalService.notifications();
      setItems(data.notifications || []);
      setUnread(data.unread || 0);
    } catch {
      /* keep the last known state on a transient failure */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 60000); // light polling; socket is chat-only
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const openMenu = () => {
    setOpen((v) => !v);
    if (!open) load();
  };

  const onItem = async (n) => {
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      portalService.markNotificationRead(n._id).catch(() => null);
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const markAll = async () => {
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnread(0);
    portalService.markAllNotificationsRead().catch(() => null);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={openMenu}
        className="relative rounded-lg p-2 text-ink-600 hover:bg-ink-100"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-ink-900">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-pop">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-2.5">
            <span className="text-sm font-semibold text-ink-900">Notifications</span>
            {unread > 0 && (
              <button type="button" onClick={markAll} className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline">
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto scroll-thin">
            {loading && !items.length ? (
              <p className="px-4 py-6 text-center text-sm text-ink-500">Loading…</p>
            ) : !items.length ? (
              <p className="px-4 py-6 text-center text-sm text-ink-500">You’re all caught up.</p>
            ) : (
              items.map((n) => (
                <button
                  key={n._id}
                  type="button"
                  onClick={() => onItem(n)}
                  className={cn(
                    'flex w-full flex-col items-start gap-0.5 border-b border-ink-50 px-4 py-3 text-left hover:bg-ink-50',
                    !n.read && 'bg-brand-50/60'
                  )}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ink-900">{n.title}</span>
                    {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" />}
                  </span>
                  {n.body && <span className="line-clamp-2 text-xs text-ink-600">{n.body}</span>}
                  <span className="text-[11px] text-ink-400">{timeAgo(n.createdAt)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
