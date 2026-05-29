import { defineStore } from 'pinia';
import { ref } from 'vue';
import { submitFeedback as apiSubmit, type FeedbackPayload } from '@/api/feedback';

/**
 * Feedback modal state. The component reads `open` + `meta` to render,
 * the openers (DetailSidebar / MessageBubble) set meta + flip open.
 */
export interface FeedbackMeta {
  type: 'chat' | 'message';
  session_id: string;
  message_index?: number;
  message_type?: string;
  message_timestamp?: string;
  message_text_excerpt?: string;
  tool_name?: string;
  message_count?: number;
  raw_message?: unknown;
}

export const useFeedbackStore = defineStore('feedback', () => {
  const open = ref(false);
  const meta = ref<FeedbackMeta | null>(null);
  const submitting = ref(false);
  /** null | 'success' | 'error' — used by the modal to colour the status row. */
  const status = ref<'success' | 'error' | null>(null);
  const message = ref<string>(''); // status text

  function openChatFeedback(sessionId: string, messageCount: number): void {
    meta.value = { type: 'chat', session_id: sessionId, message_count: messageCount };
    status.value = null;
    message.value = '';
    open.value = true;
  }

  function openMessageFeedback(m: FeedbackMeta): void {
    meta.value = m;
    status.value = null;
    message.value = '';
    open.value = true;
  }

  function close(): void {
    open.value = false;
    meta.value = null;
    submitting.value = false;
    status.value = null;
    message.value = '';
  }

  async function submit(opts: { category: string; comment: string; env: string; submittedBy: string | null }): Promise<void> {
    if (!meta.value) return;
    submitting.value = true;
    status.value = null;
    message.value = 'Submitting...';
    const payload: FeedbackPayload = {
      category: opts.category,
      comment: opts.comment,
      env: opts.env,
      feedback_type: meta.value.type,
      session_id: meta.value.session_id,
      message_index: meta.value.message_index,
      message_type: meta.value.message_type,
      message_timestamp: meta.value.message_timestamp,
      message_text_excerpt: meta.value.message_text_excerpt,
      tool_name: meta.value.tool_name,
      message_count: meta.value.message_count,
      raw_message: meta.value.raw_message,
      submitted_by: opts.submittedBy,
      submitted_at: new Date().toISOString(),
    };
    try {
      await apiSubmit(payload);
      status.value = 'success';
      message.value = 'Feedback submitted. Thank you!';
    } catch (err) {
      status.value = 'error';
      message.value = `Failed to submit: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      submitting.value = false;
    }
  }

  return { open, meta, submitting, status, message, openChatFeedback, openMessageFeedback, close, submit };
});
