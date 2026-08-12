import React from 'react';
import { Avatar, EmptyState, PresenceDot, Spinner } from '../ui';
import { shortTime } from '../../utils/format';
import cn from '../../utils/cn';

/**
 * The inbox list, deliberately reduced to who is talking and when.
 *
 * Everything else about the person (product, plan, tickets, notes) lives behind
 * the avatar, which opens their profile popup — the row itself stays scannable.
 */
export default function ConversationList({ conversations, loading, activeId, onSelect, onOpenProfile }) {
  if (loading) return <Spinner label="Loading conversations…" />;

  if (!conversations.length) {
    return (
      <EmptyState
        title="No conversations here"
        description="Try a different filter, or wait for a customer to start a chat."
      />
    );
  }

  return (
    <ul className="divide-y divide-ink-100">
      {conversations.map((c) => {
        const customer = c.customerId || {};
        const name = customer.name || customer.email || 'Anonymous visitor';
        const active = String(c._id) === String(activeId);
        const unread = c.unreadForAgent > 0;

        return (
          <li
            key={c._id}
            className={cn(
              'flex items-center gap-2.5 px-3 py-2.5 transition-colors',
              active ? 'bg-brand-50 ring-1 ring-inset ring-brand-200' : 'hover:bg-ink-50'
            )}
          >
            {/* Sibling of the row button, not nested inside it — a button in a
                button is invalid and swallows the click on the avatar. */}
            <ProfileButton
              name={name}
              presence={c.customerPresence}
              onClick={customer._id ? () => onOpenProfile?.(customer) : null}
            />

            <button
              onClick={() => onSelect(c)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <span className={cn('truncate text-sm', unread ? 'font-semibold text-ink-900' : 'font-medium text-ink-800')}>
                {name}
              </span>
              {unread && (
                <span className="shrink-0 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-ink-900">
                  {c.unreadForAgent}
                </span>
              )}
              <span className="ml-auto shrink-0 text-[11px] text-ink-400">{shortTime(c.lastMessageAt)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ProfileButton({ name, presence, onClick }) {
  const inner = (
    <>
      <Avatar name={name} size="sm" />
      <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white p-[2px]">
        <PresenceDot status={presence || 'offline'} />
      </span>
    </>
  );

  if (!onClick) return <span className="relative shrink-0">{inner}</span>;

  return (
    <button
      type="button"
      onClick={onClick}
      title={`View ${name}'s profile`}
      aria-label={`View ${name}'s profile`}
      className="relative shrink-0 rounded-full transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
    >
      {inner}
    </button>
  );
}
