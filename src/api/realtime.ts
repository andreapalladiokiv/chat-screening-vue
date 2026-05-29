import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/api/supabase';

export type RealtimeStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED';

export interface RealtimeRow {
  session_id?: string | null;
  created_at?: string | null;
  message?: unknown;
}

/**
 * Subscribe to INSERTs on `chat_messages`. Returns the channel handle and
 * forwards subscription status via the onStatus callback (so callers can
 * toggle a "Live" indicator). The insert payload's `new` row is forwarded
 * via onInsert — handling is left to the caller.
 */
export function subscribeChatMessages(opts: {
  onStatus?: (s: RealtimeStatus) => void;
  onInsert?: (row: RealtimeRow) => void;
}): RealtimeChannel {
  const db = getSupabaseClient();
  const channel = db
    .channel('chat-realtime')
    .on(
      'postgres_changes' as never,
      { event: 'INSERT', schema: 'public', table: 'chat_messages' },
      (payload: { new: RealtimeRow }) => {
        opts.onInsert?.(payload.new);
      },
    )
    .subscribe((status: string) => {
      opts.onStatus?.(status as RealtimeStatus);
    });
  return channel;
}

export function unsubscribeChannel(channel: RealtimeChannel | null): void {
  if (!channel) return;
  try {
    const db = getSupabaseClient();
    db.removeChannel(channel);
  } catch {
    // Client may have been cleared already (e.g. during sign-out).
  }
}
