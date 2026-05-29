import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  loadDefaultSessions as apiLoadDefault,
  loadMoreSessions as apiLoadMore,
  loadFilteredSessions as apiLoadFiltered,
  searchSessions as apiSearch,
  type SessionFilterParams,
} from '@/api/sessions';
import { subscribeChatMessages, unsubscribeChannel } from '@/api/realtime';
import type { Session } from '@/types/session';

const RETRY_DELAY_MS = 2_000;
const MAX_RETRIES = 2;
const SEARCH_DEBOUNCE_MS = 400;
const REALTIME_RETRY_MS = 5_000;

/**
 * Wait `ms` milliseconds. A function instead of inline `new Promise(...)` so
 * it's mockable in tests later.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const useSessionsStore = defineStore('sessions', () => {
  const list = ref<Session[]>([]);
  const cursor = ref<string | null>(null);
  const loading = ref(false);
  const loadingMore = ref(false);
  const noMore = ref(false);
  const error = ref<string | null>(null);

  /** id of the currently selected session, if any. */
  const currentId = ref<string | null>(null);
  const current = computed<Session | null>(() =>
    currentId.value ? list.value.find((s) => s.id === currentId.value) ?? null : null,
  );

  /** Search state. searchResults === null means "no search active". */
  const searchQuery = ref('');
  const searchResults = ref<Session[] | null>(null);
  const searchError = ref<string | null>(null);
  const searchLoading = ref(false);
  let searchDebounceHandle: ReturnType<typeof setTimeout> | null = null;
  /** Bumps on every new query so a slow in-flight RPC can recognise it's stale. */
  let searchEpoch = 0;

  /** Client-side sort + reviewed filter — declared here so the `visible`
   * computed below can read them. The actual state is managed via the
   * applyFilters / clearFilters actions further down. */
  type SortBy = 'newest' | 'oldest' | 'most-msgs' | 'least-msgs';
  type ReviewedFilter = 'all' | 'unreviewed' | 'reviewed';
  const sortBy = ref<SortBy>('newest');
  const reviewedFilter = ref<ReviewedFilter>('all');

  /** Reviewed-session IDs, mirrored to localStorage under a per-project key
   * so different environments stay separate. */
  const reviewedIds = ref<Set<string>>(new Set());

  function reviewedKey(): string {
    const projectId = localStorage.getItem('sb_project_id') || 'default';
    return `sb_reviewed_${projectId}`;
  }
  function loadReviewed(): void {
    try {
      const raw = localStorage.getItem(reviewedKey());
      reviewedIds.value = raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      reviewedIds.value = new Set();
    }
  }
  function saveReviewed(): void {
    try {
      localStorage.setItem(reviewedKey(), JSON.stringify([...reviewedIds.value]));
    } catch {
      // localStorage may be unavailable in private mode; non-fatal.
    }
  }
  function toggleReviewed(id: string): void {
    const next = new Set(reviewedIds.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    reviewedIds.value = next;
    saveReviewed();
  }

  /** Sessions actually visible in the list. Pipeline:
   *   1. base = search results when active, else the default list
   *   2. apply reviewed filter (all / reviewed / unreviewed) — client-side
   *   3. apply sort (newest / oldest / most-msgs / least-msgs) — client-side
   * Steps 2 and 3 mirror legacy's renderSessionList semantics. */
  const visible = computed<Session[]>(() => {
    const base = searchResults.value !== null ? searchResults.value : list.value;

    const filtered =
      reviewedFilter.value === 'all'
        ? base
        : base.filter((s) => {
            const isReviewed = reviewedIds.value.has(s.id);
            return reviewedFilter.value === 'reviewed' ? isReviewed : !isReviewed;
          });

    const sorted = [...filtered];
    switch (sortBy.value) {
      case 'newest':
        sorted.sort((a, b) => (a.latest < b.latest ? 1 : a.latest > b.latest ? -1 : 0));
        break;
      case 'oldest':
        sorted.sort((a, b) => (a.latest < b.latest ? -1 : a.latest > b.latest ? 1 : 0));
        break;
      case 'most-msgs':
        sorted.sort((a, b) => b.count - a.count);
        break;
      case 'least-msgs':
        sorted.sort((a, b) => a.count - b.count);
        break;
    }
    return sorted;
  });

  /** Filter state. appliedFilters !== null means filters are active. */
  const appliedFilters = ref<SessionFilterParams | null>(null);
  const filtersApplied = computed(() => appliedFilters.value !== null);

  async function applyFilters(filters: SessionFilterParams): Promise<void> {
    loading.value = true;
    error.value = null;
    clearSearch();
    try {
      const result = await apiLoadFiltered(filters);
      list.value = result;
      appliedFilters.value = filters;
      cursor.value = result.length ? result[result.length - 1].latest : null;
      noMore.value = result.length < 50;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      appliedFilters.value = null;
    } finally {
      loading.value = false;
    }
  }

  async function clearFilters(): Promise<void> {
    appliedFilters.value = null;
    await loadDefault();
  }

  /** Realtime subscription. isLive drives the TopNav "Live" badge. */
  const isLive = ref(false);
  let realtimeChannel: RealtimeChannel | null = null;
  let realtimeRetryHandle: ReturnType<typeof setTimeout> | null = null;

  function subscribeRealtime() {
    if (realtimeChannel) return;
    if (realtimeRetryHandle) {
      clearTimeout(realtimeRetryHandle);
      realtimeRetryHandle = null;
    }
    realtimeChannel = subscribeChatMessages({
      onStatus: (status) => {
        isLive.value = status === 'SUBSCRIBED';
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[realtime] channel lost, retrying in 5s');
          unsubscribeRealtime();
          realtimeRetryHandle = setTimeout(subscribeRealtime, REALTIME_RETRY_MS);
        }
      },
      // INSERT handler is a stub for now — list updates from realtime arrive
      // in a later M2 sub-milestone. The subscription itself toggles isLive.
      onInsert: () => { /* TODO: insert into list when filter/search inactive */ },
    });
  }

  function unsubscribeRealtime() {
    if (realtimeRetryHandle) {
      clearTimeout(realtimeRetryHandle);
      realtimeRetryHandle = null;
    }
    unsubscribeChannel(realtimeChannel);
    realtimeChannel = null;
    isLive.value = false;
  }

  function clearSearch() {
    if (searchDebounceHandle) clearTimeout(searchDebounceHandle);
    searchDebounceHandle = null;
    searchEpoch++; // invalidate any in-flight
    searchQuery.value = '';
    searchResults.value = null;
    searchError.value = null;
    searchLoading.value = false;
  }

  function setSearchQuery(q: string) {
    searchQuery.value = q;
    if (searchDebounceHandle) clearTimeout(searchDebounceHandle);

    const trimmed = q.trim();
    if (!trimmed) {
      clearSearch();
      return;
    }

    searchLoading.value = true;
    searchError.value = null;
    const myEpoch = ++searchEpoch;

    searchDebounceHandle = setTimeout(async () => {
      try {
        const results = await apiSearch(trimmed);
        if (myEpoch !== searchEpoch) return; // user kept typing — drop stale response
        searchResults.value = results;
        searchError.value = null;
      } catch (err) {
        if (myEpoch !== searchEpoch) return;
        searchResults.value = null;
        searchError.value = err instanceof Error ? err.message : String(err);
      } finally {
        if (myEpoch === searchEpoch) searchLoading.value = false;
      }
    }, SEARCH_DEBOUNCE_MS);
  }

  function reset() {
    list.value = [];
    cursor.value = null;
    noMore.value = false;
    error.value = null;
    currentId.value = null;
    clearSearch();
    unsubscribeRealtime();
  }

  /**
   * Initial load — last 3 days, up to 50 most recent. Retries up to
   * MAX_RETRIES on transient failure (matches legacy resilience).
   */
  async function loadDefault(): Promise<void> {
    loading.value = true;
    error.value = null;
    reset();
    loading.value = true; // reset() flips loading off; re-set

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const sessions = await apiLoadDefault();
        list.value = sessions;
        if (sessions.length > 0) {
          cursor.value = sessions[sessions.length - 1].latest;
        }
        if (sessions.length < 50) noMore.value = true;
        loading.value = false;
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt < MAX_RETRIES) {
          await delay(RETRY_DELAY_MS);
          continue;
        }
        error.value = msg;
        loading.value = false;
      }
    }
  }

  /**
   * Infinite-scroll page. No-op if already loading, no more, or no cursor.
   */
  async function loadMore(): Promise<void> {
    if (loadingMore.value || noMore.value || !cursor.value) return;
    loadingMore.value = true;
    try {
      const sessions = await apiLoadMore(cursor.value);
      if (sessions.length === 0) {
        noMore.value = true;
      } else {
        list.value = list.value.concat(sessions);
        cursor.value = sessions[sessions.length - 1].latest;
        if (sessions.length < 10) noMore.value = true;
      }
    } catch (err) {
      // Soft-fail: log but don't block further attempts. Page-load failures
      // don't invalidate the already-loaded list.
      console.error('[sessions] loadMore failed:', err);
    } finally {
      loadingMore.value = false;
    }
  }

  function select(id: string | null) {
    currentId.value = id;
  }

  /**
   * Time-gate range for the UI strip. Computed against the currently visible
   * set (search results when active, else default list). Uses each session's
   * `latest` (last activity) for BOTH bounds — mirrors legacy semantics:
   * "shows the period of session activity". Using `earliest` for the low
   * bound would push it into the start of the oldest session, not when it
   * last ran.
   */
  const timeGate = computed(() => {
    const src = visible.value;
    if (src.length === 0) return null;
    const arr = src.map((s) => s.latest);
    return {
      earliest: arr.reduce((a, b) => (a < b ? a : b)),
      latest: arr.reduce((a, b) => (a > b ? a : b)),
    };
  });

  return {
    list,
    cursor,
    loading,
    loadingMore,
    noMore,
    error,
    currentId,
    current,
    timeGate,
    visible,
    searchQuery,
    searchResults,
    searchError,
    searchLoading,
    isLive,
    appliedFilters,
    filtersApplied,
    sortBy,
    reviewedFilter,
    reviewedIds,
    loadReviewed,
    toggleReviewed,
    setSearchQuery,
    clearSearch,
    applyFilters,
    clearFilters,
    subscribeRealtime,
    unsubscribeRealtime,
    loadDefault,
    loadMore,
    select,
    reset,
  };
});
