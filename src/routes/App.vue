<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import TopNav from '@/components/TopNav.vue';
import SessionList from '@/components/SessionList.vue';
import FilterPopover from '@/components/FilterPopover.vue';
import ChatView from '@/components/ChatView.vue';
import DetailSidebar from '@/components/DetailSidebar.vue';
import FeedbackModal from '@/components/FeedbackModal.vue';
import { useSessionsStore } from '@/stores/sessions';

const sessions = useSessionsStore();
const route = useRoute();
const router = useRouter();

// Realtime subscription — lives for the lifetime of the /app route.
// SessionList itself triggers the initial loadDefault on mount; we just
// turn on the Live indicator here. We also hydrate the reviewed set
// from localStorage so the "Reviewed ✓" toggle persists across reloads.
onMounted(() => {
  sessions.loadReviewed();
  sessions.loadFilterOptions();
  sessions.subscribeRealtime();
});
onBeforeUnmount(() => sessions.unsubscribeRealtime());

// FilterPopover open state — owned by the route so the popover can render
// at the top level (its overlay needs to cover everything below TopNav).
const filterOpen = ref(false);

// ── Deep link: ?session=<id> & ?q=<search> ──────────────────────────────
// Two-way binding between the store and the URL so reloads / shareable
// links restore both the search context and the selected session.
//
// 1. URL → store: on mount / nav / paste, re-issue the search and look up
//    the session in either the default list or the search results.
// 2. Store → URL: when the user types in search or picks a session, mirror
//    the change back to the query string. router.replace (not push) avoids
//    polluting browser history with every keystroke.

watch(
  () => route.query.q,
  (q) => {
    const next = typeof q === 'string' ? q : '';
    if (sessions.searchQuery === next) return;
    if (next) sessions.setSearchQuery(next);
    else sessions.clearSearch();
  },
  { immediate: true },
);

watch(
  () => sessions.searchQuery,
  (q) => {
    const cur = typeof route.query.q === 'string' ? route.query.q : '';
    if (q === cur) return;
    const next = { ...route.query };
    if (q) next.q = q;
    else delete next.q;
    router.replace({ query: next });
  },
);

watch(
  () => [route.query.session, sessions.list, sessions.searchResults] as const,
  ([querySession, list, searchResults]) => {
    const id = typeof querySession === 'string' ? querySession : null;
    if (!id) {
      if (sessions.currentId) sessions.select(null);
      return;
    }
    if (sessions.currentId === id) return;
    const found =
      list.find((s) => s.id === id) ?? searchResults?.find((s) => s.id === id) ?? null;
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
    <FeedbackModal />
    <div class="content">
      <SessionList />
      <main class="chat-area">
        <div v-if="!sessions.current" class="chat-empty">
          <p>Select a session from the list to view the conversation.</p>
        </div>
        <ChatView v-else />
      </main>
      <DetailSidebar />
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
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--chat-bg);
  /* WhatsApp-style faint dot pattern — matches legacy .chat-area. */
  background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c8c8c8' fill-opacity='0.1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
  overflow: hidden;
}

.chat-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2.5rem;
  text-align: center;
  color: var(--text-secondary);
}
</style>
