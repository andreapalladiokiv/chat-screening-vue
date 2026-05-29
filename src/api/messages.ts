import { getSupabaseClient } from '@/api/supabase';
import type { ChatMessageRow } from '@/types/message';

/**
 * Fetch all messages for a session, oldest → newest.
 * Selects only the columns we need to keep the payload small.
 */
export async function loadSessionMessages(sessionId: string): Promise<ChatMessageRow[]> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('chat_messages')
    .select('session_id, created_at, message')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) {
    const err = error as { message?: string; details?: string };
    throw new Error(err.message ?? err.details ?? 'Failed to load messages');
  }
  return (data ?? []) as ChatMessageRow[];
}
