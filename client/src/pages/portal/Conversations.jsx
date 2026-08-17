import React, { useEffect, useState } from 'react';
import { MessagesSquare } from 'lucide-react';
import { Spinner, ErrorState, EmptyState, Button } from '../../components/ui';
import { portalService } from '../../services/portalApi';
import { RecentConversationCard } from '../../components/portal/cards';
import { useNavigate } from 'react-router-dom';

export default function Conversations() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = async () => {
    setError('');
    try {
      setItems(await portalService.conversations());
    } catch (err) {
      setError(err.friendlyMessage || 'Could not load your conversations.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!items) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="Loading your messages…" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink-900">Messages</h1>
      <p className="mt-1 text-ink-500">Your support conversations across all products.</p>

      {items.length ? (
        <div className="mt-6 space-y-2">
          {items.map((c) => (
            <RecentConversationCard key={c._id} conversation={c} />
          ))}
        </div>
      ) : (
        <div className="mt-6">
          <EmptyState
            icon={MessagesSquare}
            title="No conversations yet"
            description="When you chat with the AI or our team, your conversations show up here."
            action={<Button onClick={() => navigate('/portal/support')}>Start a conversation</Button>}
          />
        </div>
      )}
    </div>
  );
}
