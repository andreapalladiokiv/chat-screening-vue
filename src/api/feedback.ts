import { getSupabaseClient } from '@/api/supabase';

/**
 * Payload shape sent to the chat-feedback Edge Function. Mirrors legacy
 * submitFeedback exactly — the Edge Function inserts a row into
 * chat_feedback and forwards the same body to the n8n webhook
 * (VA_FEEDBACK_FORM_WEBHOOK). Per #161, n8n's Notion mapping expects
 * all fields to be present even for chat-level submissions; we send
 * undefined and let JSON.stringify drop those keys (existing behaviour).
 */
export interface FeedbackPayload {
  category: string;
  comment: string;
  env: string;
  feedback_type: 'chat' | 'message';
  session_id: string;
  message_index?: number;
  message_type?: string;
  message_timestamp?: string;
  message_text_excerpt?: string;
  tool_name?: string;
  message_count?: number;
  raw_message?: unknown;
  submitted_by: string | null;
  submitted_at: string;
}

export async function submitFeedback(payload: FeedbackPayload): Promise<void> {
  const db = getSupabaseClient();
  const { error } = await db.functions.invoke('chat-feedback', { body: payload });
  if (error) {
    const err = error as { message?: string };
    throw new Error(err.message ?? 'Failed to submit feedback');
  }
}
