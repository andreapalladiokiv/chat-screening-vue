<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useSessionsStore } from '@/stores/sessions';
import SessionListItem from '@/components/SessionListItem.vue';
import { formatTimeGate } from '@/utils/formatDate';

const sessions = useSessionsStore();
const listRef = ref<HTMLElement | null>(null);

onMounted(async () => {
  if (sessions.list.length === 0 && !sessions.loading) {
    await sessions.loadDefault();
  }
});

function onSelect(id: string) {
  sessions.select(id);
}

function onScroll() {
  const el = listRef.value;
  if (!el) return;
  // Pagination only applies to the default list — search results are a
  // single shot (RPC returns up to 50 matches).
  if (sessions.searchResults !== null) return;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) {
    sessions.loadMore();
  }
}

function onClearSearch() {
  sessions.clearSearch();
}

const timeGateText = computed(() => {
  const t = sessions.timeGate;
  return t ? formatTimeGate(t.earliest, t.latest) : '';
});

const countText = computed(() => {
  // Search mode has its own counts/states — surface them first.
  if (sessions.searchLoading) return 'Searching…';
  if (sessions.searchError) return sessions.searchError;
  if (sessions.searchResults !== null) {
    const n = sessions.searchResults.length;
    return n === 0 ? 'No sessions match this search.' : `${n} match${n === 1 ? '' : 'es'}`;
  }
  // Default list mode.
  if (sessions.loading) return 'Loading…';
  if (sessions.error) return sessions.error;
  if (sessions.list.length === 0) return 'No sessions found.';
  return `${sessions.list.length} ${sessions.noMore ? 'sessions' : 'sessions+'}`;
});
</script>

<template>
  <div class="sidebar">
    <div class="session-info-bar">
      <span class="session-count" aria-live="polite">{{ countText }}</span>
      <span class="time-gate">{{ timeGateText }}</span>
    </div>

    <ul ref="listRef" class="session-list" @scroll="onScroll">
      <li v-if="sessions.searchLoading" class="scroll-loader">Searching...</li>

      <template v-else-if="sessions.searchError">
        <li class="search-error">
          <div>{{ sessions.searchError }}</div>
          <button class="search-clear-link" @click="onClearSearch">Clear search</button>
        </li>
      </template>

      <template v-else-if="sessions.searchResults !== null && sessions.searchResults.length === 0">
        <li class="search-error">
          <div>No sessions match "{{ sessions.searchQuery }}".</div>
          <button class="search-clear-link" @click="onClearSearch">Clear search</button>
        </li>
      </template>

      <template v-else>
        <SessionListItem
          v-for="s in sessions.visible"
          :key="s.id"
          :session="s"
          :active="sessions.currentId === s.id"
          @select="onSelect"
        />
        <li v-if="sessions.loadingMore" class="scroll-loader">Loading more sessions...</li>
      </template>
    </ul>
  </div>
</template>

<style scoped>
.sidebar {
  width: 21.25rem;
  min-width: 16.25rem;
  flex-shrink: 0;
  background: var(--sidebar-bg);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.session-info-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.625rem 1rem;
  border-bottom: 1px solid var(--border);
  min-height: 3.125rem;
  flex-shrink: 0;
}

.session-count {
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-weight: 600;
}

.time-gate {
  font-size: 0.6875rem;
  color: var(--accent);
  font-weight: 600;
  white-space: nowrap;
}

.session-list {
  flex: 1;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 0;
}

.scroll-loader {
  text-align: center;
  padding: 0.625rem;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.search-error {
  padding: 1.5rem 1rem;
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.search-clear-link {
  margin-top: 0.5rem;
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 0.8125rem;
  text-decoration: underline;
}
.search-clear-link:hover {
  color: var(--accent-hover);
}
</style>
