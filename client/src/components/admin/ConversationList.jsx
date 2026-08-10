import React from 'react';
import { Bot, Headphones, Paperclip } from 'lucide-react';
import { Badge, PresenceDot, Avatar, EmptyState, Spinner } from '../ui';
import { shortTime, timeAgo } from '../../utils/format';
import cn from '../../utils/cn';

const PRIORITY_TONE = { urgent: 'red', high: 'amber', normal: null, low: null };

export default function ConversationList({ conversations, loading, activeId, onSelect }) {
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
        const active = String(c._id) === String(activeId);
        const unread = c.unreadForAgent > 0;

        return (
          <li key={c._id}>
            <button
              onClick={() => onSelect(c)}
              className={cn(
                'w-full px-3 py-3 text-left transition-colors',
                active ? 'bg-brand-50 ring-1 ring-inset ring-brand-200' : 'hover:bg-ink-50'
              )}
            >
              <div className="flex items-start gap-2.5">
                <div className="relative shrink-0">
                  <Avatar name={customer.name || customer.email || 'Anonymous'} size="sm" />
                  <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white p-[2px]">
                    <PresenceDot status={c.customerPresence || 'offline'} />
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className={cn('truncate text-sm', unread ? 'font-semibold text-ink-900' : 'font-medium text-ink-800')}>
                      {customer.name || customer.email || 'Anonymous visitor'}
                    </p>
                    <span className="ml-auto shrink-0 text-[11px] text-ink-400">{shortTime(c.lastMessageAt)}</span>
                  </div>

                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ background: c.productId?.brandColor || '#94a3b8' }}
                      aria-hidden="true"
                    />
                    <span className="truncate text-[11px] font-medium text-ink-500">{c.productId?.name}</span>
                    {c.channel === 'ai' ? (
                      <Bot className="h-3 w-3 shrink-0 text-ink-400" title="Handled by AI" />
                    ) : (
                      <Headphones className="h-3 w-3 shrink-0 text-brand-500" title="With the team" />
                    )}
                  </div>

                  <p className={cn('mt-1 line-clamp-1 text-xs', unread ? 'font-medium text-ink-700' : 'text-ink-500')}>
                    {c.lastMessageSender === 'agent' && 'You: '}
                    {c.lastMessagePreview || 'No messages yet'}
                  </p>

                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {PRIORITY_TONE[c.priority] && <Badge tone={PRIORITY_TONE[c.priority]}>{c.priority}</Badge>}
                    {!c.assignedAgentId ? (
                      <Badge tone="amber">Unassigned</Badge>
                    ) : (
                      <span className="text-[11px] text-ink-400">{c.assignedAgentId?.name}</span>
                    )}
                    {c.handoffRequested && c.channel === 'human' && !c.assignedAgentId && (
                      <Badge tone="indigo">Wants a person</Badge>
                    )}
                    {['resolved', 'closed'].includes(c.status) && <Badge tone="green">{c.status}</Badge>}
                    {unread && (
                      <span className="ml-auto rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {c.unreadForAgent}
                      </span>
                    )}
                  </div>

                  {c.customerPresence === 'offline' && customer.lastSeenAt && (
                    <p className="mt-1 text-[11px] text-ink-400">Last seen {timeAgo(customer.lastSeenAt)}</p>
                  )}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
