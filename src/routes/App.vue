<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import TopNav from '@/components/TopNav.vue';
import SessionList from '@/components/SessionList.vue';
import FilterPopover from '@/components/FilterPopover.vue';
import { useSessionsStore } from '@/stores/sessions';

const sessions = useSessionsStore();
const route = useRoute();
const router = useRouter();

// Realtime subscription — lives for the lifetime of the /app route.
// SessionList itself triggers the initial loadDefault on mount; we just
// turn on the Live indicator here.
onMounted(() => sessions.subscribeRealtime());
onBeforeUnmount(() => sessions.unsubscribeRealtime());

// FilterPopover open state — owned by the route so the popover can render
// at the top level (its overlay needs to cover everything below TopNav).
const filterOpen = ref(false);

// ── Deep link: ?session=<id> ────────────────────────────────────────────
// Two-way binding between sessions.currentId and the URL's `session` query.
//
// 1. URL → store: whenever the query changes (page mount, back/fwd nav,
//    user pastes a URL), find the session in the loaded list and select it.
//    Re-runs as the list itself populates because we watch both sources.
// 2. Store → URL: when the user clicks a session, write its id to the
//    query so the URL is shareable. router.replace (not push) avoids
//    polluting browser history with selection changes.
//
// TODO (later M2): fetch-by-id when the session isn't in the loaded list
// (older than 3 days). For now we simply leave currentId null in that case.

watch(
  () => [route.query.session, sessions.list] as const,
  ([querySession, list]) => {
    const id = typeof querySession === 'string' ? querySession : null;
    if (!id) {
      if (sessions.currentId) sessions.select(null);
      return;
    }
    if (sessions.currentId === id) return;
    const found = list.find((s) => s.id === id);
    if (found) sessions.select(id);
  },
  { immediate: true },
);

watch(
  () => sessions.currentId,
  (id) => {
    const currentQuery = route.query.session;
    if (id && currentQuery === id) return;
    if (!id && !currentQuery) return;
    const next = { ...route.query };
    if (id) next.session = id;
    else delete next.session;
    router.replace({ query: next });
  },
);
</script>

<template>
  <div class="shell">
    <TopNav @open-filters="filterOpen = true" />
    <FilterPopover :open="filterOpen" @close="filterOpen = false" />
    <div class="content">
      <SessionList />
      <main class="chat-area">
        <div v-if="!sessions.current" class="chat-empty">
          <p>Select a session from the list to view the conversation.</p>
          <p class="hint">Chat view, filters, and feedback land in subsequent M2 milestones.</p>
        </div>
        <div v-else class="chat-placeholder">
          <h3>{{ sessions.current.conversationId || sessions.current.id }}</h3>
          <p>{{ sessions.current.count }} messages — first {{ sessions.current.earliest }}, last {{ sessions.current.latest }}</p>
          <p class="hint">Message rendering arrives in a later M2 sub-milestone. For now this confirms click → selected-id + deep-link wiring.</p>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg);
}

.content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--chat-bg);
  overflow: hidden;
}

.chat-empty,
.chat-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  text-align: center;
  color: var(--text-secondary);
}

.chat-placeholder h3 {
  font-size: 16px;
  color: var(--text-primary);
  margin-bottom: 12px;
  word-break: break-all;
}

.chat-empty p,
.chat-placeholder p {
  margin-bottom: 8px;
}

.hint {
  margin-top: 12px;
  padding: 12px 16px;
  background: var(--surface);
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  font-size: 13px;
  max-width: 480px;
}
</style>
