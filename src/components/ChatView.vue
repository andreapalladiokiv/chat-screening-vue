<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useSessionsStore } from '@/stores/sessions';
import { useMessagesStore } from '@/stores/messages';
import { Selectors } from '@/constants/selectors';
import MessageBubble from '@/components/MessageBubble.vue';

const sessions = useSessionsStore();
const messages = useMessagesStore();
const containerRef = ref<HTMLElement | null>(null);

// Mirror the container element into the store so the detail sidebar's
// in-session search can walk the DOM directly (same approach as legacy).
watch(
  containerRef,
  (el) => {
    messages.containerEl = el;
  },
);

const displayId = computed(() => {
  const s = sessions.current;
  if (!s) return '';
  return s.conversationId || s.id;
});

async function copySessionId() {
  if (!sessions.current) return;
  try {
    await navigator.clipboard.writeText(sessions.current.id);
  } catch {
    // ignore
  }
}

// Whenever the selected session changes, load its messages and scroll
// to the bottom once they render.
watch(
  () => sessions.currentId,
  async (id) => {
    if (!id) {
      messages.clear();
      return;
    }
    await messages.load(id);
    await nextTick();
    if (containerRef.value) {
      containerRef.value.scrollTop = containerRef.value.scrollHeight;
    }
  },
  { immediate: true },
);

// Quick-Jump from the detail sidebar: navigate to the first AI / first
// tool bubble, or the last bubble overall. We resolve the target via
// querySelector against the message-wrapper classes that MessageBubble
// emits, then scrollIntoView smoothly.
watch(
  () => messages.jumpTarget,
  async (target) => {
    if (!target || !containerRef.value) return;
    await nextTick();
    const selector =
      target === 'first-ai'
        ? Selectors.messageWrapper.ai
        : target === 'first-tool'
          ? Selectors.messageWrapper.tool
          : Selectors.messageWrapper.last;
    const el = containerRef.value.querySelector(selector) as HTMLElement | null;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    messages.clearJump();
  },
);
</script>

<template>
  <div class="chat-pane">
    <div class="chat-header">
      <div class="chat-session-controls">
        <h3 class="session-id-copy" :title="sessions.current?.id" @click="copySessionId">
          {{ displayId }}
        </h3>
      </div>
      <div class="chat-header-right">
        <!-- In-session search lands in a later M2 sub-milestone. -->
      </div>
    </div>

    <div v-if="messages.loading" class="chat-state">Loading messages…</div>

    <div v-else-if="messages.error" class="chat-state error">
      Failed to load messages: {{ messages.error }}
    </div>

    <div v-else-if="messages.parsed.length === 0" class="chat-state">
      No messages in this session.
    </div>

    <div v-else ref="containerRef" class="messages-container">
      <MessageBubble
        v-for="(m, i) in messages.parsed"
        :key="`${messages.sessionId}-${i}`"
        :parsed="m"
        :index="i"
      />
    </div>
  </div>
</template>

<style scoped>
.chat-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  /* Background + dot pattern come from .chat-area in routes/App.vue
   * (matches legacy where .chat-area carries the WhatsApp bg). */
}

.chat-header {
  padding: 0.625rem 1rem;
  background: var(--sidebar-bg);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  flex-shrink: 0;
  min-height: 3.125rem;
}

.chat-session-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.chat-header-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
  margin-left: auto;
}

.chat-header h3 {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex-shrink: 1;
}

.session-id-copy {
  cursor: pointer;
  transition: color 0.2s;
}
.session-id-copy:hover {
  color: var(--accent);
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.chat-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  padding: 2.5rem;
  text-align: center;
}
.chat-state.error {
  color: var(--danger);
}
</style>
