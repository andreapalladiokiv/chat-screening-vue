import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { loadSessionMessages } from '@/api/messages';
import { parseMessage } from '@/utils/parseMessage';
import type { ChatMessageRow, ParsedMessage } from '@/types/message';

/**
 * Messages store — fetches and exposes parsed messages for the currently
 * selected session. Re-runs whenever the caller calls load(newId).
 *
 * Kept separate from the sessions store: the session list, filters,
 * search, and realtime concerns are orthogonal to the per-session chat
 * payload. Same separation as the review's data-access layer split.
 */
export const useMessagesStore = defineStore('messages', () => {
  const sessionId = ref<string | null>(null);
  const rows = ref<ChatMessageRow[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  /** Parsed view of `rows`. Recomputed when the row list changes. */
  const parsed = computed<ParsedMessage[]>(() => rows.value.map((r) => parseMessage(r)));

  async function load(id: string): Promise<void> {
    if (sessionId.value === id && rows.value.length && !error.value) {
      // Already loaded this session — no-op.
      return;
    }
    sessionId.value = id;
    rows.value = [];
    error.value = null;
    loading.value = true;
    try {
      rows.value = await loadSessionMessages(id);
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  function clear(): void {
    sessionId.value = null;
    rows.value = [];
    error.value = null;
    loading.value = false;
    allToolDetailsOpen.value = false;
    jumpTarget.value = null;
  }

  /** Append a row from realtime — only if it belongs to the currently
   * loaded session and isn't already present. */
  function appendRow(row: ChatMessageRow): void {
    if (!sessionId.value || row.session_id !== sessionId.value) return;
    // De-dupe by created_at + identical message (cheap heuristic — chat_messages
    // doesn't have a primary key surfaced in the realtime payload).
    const last = rows.value[rows.value.length - 1];
    if (last && last.created_at === row.created_at) return;
    rows.value.push(row);
  }

  /** Toggled by the "Expand All / Collapse All" button. MessageBubble
   * binds <details open> to this value. */
  const allToolDetailsOpen = ref(false);

  /** "Quick Jump" target — sidebar sets it, ChatView watches and scrolls. */
  type JumpTarget = 'first-ai' | 'first-tool' | 'last' | null;
  const jumpTarget = ref<JumpTarget>(null);

  function requestJump(target: Exclude<JumpTarget, null>): void {
    jumpTarget.value = target;
  }
  function clearJump(): void {
    jumpTarget.value = null;
  }

  /** The .messages-container element from ChatView. Detail-sidebar's
   * in-session search walks this DOM directly to wrap text nodes with
   * <mark>. Set by ChatView on mount; cleared on session change. */
  const containerEl = ref<HTMLElement | null>(null);

  return {
    sessionId,
    rows,
    parsed,
    loading,
    error,
    allToolDetailsOpen,
    jumpTarget,
    containerEl,
    load,
    clear,
    appendRow,
    requestJump,
    clearJump,
  };
});
