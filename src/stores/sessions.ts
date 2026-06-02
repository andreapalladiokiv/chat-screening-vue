import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  loadDefaultSessions as apiLoadDefault,
  loadMoreSessions as apiLoadMore,
  loadFilteredSessions as apiLoadFiltered,
  loadFilterOptions as apiLoadFilterOptions,
  fetchVisitorEnrichment as apiFetchEnrichment,
  searchSessions as apiSearch,
  tryExactSessionLookup as apiExactLookup,
  type FilterOptions,
  type SessionFilterParams,
} from '@/api/sessions';
import { subscribeChatMessages, unsubscribeChannel, type RealtimeRow } from '@/api/realtime';
import { reviewedSessionsKey } from '@/constants/storage';
import { parseAndExtractAiOutput } from '@/utils/extractAiOutput';
import { useMessagesStore } from '@/stores/messages';
import type { Session } from '@/types/session';
import type { ChatMessageRow } from '@/types/message';

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
  const current = computed<Session | null>(() => {
    if (!currentId.value) return null;
    const fromList = list.value.find((s) => s.id === currentId.value);
    if (fromList) return fromList;
    return searchResults.value?.find((s) => s.id === currentId.value) ?? null;
  });

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

  /** Client-side boolean filters — applied in `visible` without an RPC
   * round-trip. '' = no filter; 'true' / 'false' = boolean match. */
  const verifiedFilter = ref<'' | 'true' | 'false'>('');
  const endConvFilter = ref<'' | 'true' | 'false'>('');

  /** Reviewed-session IDs, mirrored to localStorage under a per-project key
   * so different environments stay separate. */
  const reviewedIds = ref<Set<string>>(new Set());

  function loadReviewed(): void {
    try {
      const raw = localStorage.getItem(reviewedSessionsKey());
      reviewedIds.value = raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      reviewedIds.value = new Set();
    }
  }
  function saveReviewed(): void {
    try {
      localStorage.setItem(reviewedSessionsKey(), JSON.stringify([...reviewedIds.value]));
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

    // Client-side verified / end-conversation booleans — predicate sourced
    // from each session's aggregated `hasVerified` / `hasEndConversation`
    // (true if ANY AI final in the session emitted that flag).
    const booleanFiltered = base.filter((s) => {
      if (verifiedFilter.value && String(s.hasVerified) !== verifiedFilter.value) return false;
      if (endConvFilter.value && String(s.hasEndConversation) !== endConvFilter.value) return false;
      return true;
    });

    const filtered =
      reviewedFilter.value === 'all'
        ? booleanFiltered
        : booleanFiltered.filter((s) => {
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

  /** Catalogue of possible values for the multi-select dropdowns in the
   * filter popover. Loaded once via get_filter_options after auth. */
  const filterOptions = ref<FilterOptions>({
    tools: [],
    categories: [],
    request_types: [],
    projects: [],
    visitor_types: [],
    languages: [],
  });
  async function loadFilterOptions(): Promise<void> {
    filterOptions.value = await apiLoadFilterOptions();
  }

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
      onInsert: handleRealtimeInsert,
    });
  }

  /**
   * Aggregate a new chat_messages row into the session it belongs to, then
   * move that session to the front of the list. Mirrors legacy semantics:
   *
   *   - skip entirely when server filters or search are active (new row
   *     likely sits outside the filter's date/criteria window)
   *   - if session is new: prepend with zeroed aggregates and lazily fetch
   *     visitors_settings to enrich badges
   *   - increment count, update latest, bump type-counts
   *   - collect tool names from tool_calls / type='tool' messages
   *   - for AI finals: extract request_category / request_type / verified /
   *     end_conversation (handles wrapped + flat content formats)
   *   - mirror the row into messages.appendRow if it's for the open chat
   */
  function handleRealtimeInsert(row: RealtimeRow): void {
    if (!row || !row.session_id) return;
    if (filtersApplied.value || searchResults.value !== null) return;

    const sid = row.session_id;
    const ts = row.created_at ?? new Date().toISOString();

    let msg: Record<string, unknown> | null = null;
    try {
      msg =
        typeof row.message === 'string'
          ? (JSON.parse(row.message) as Record<string, unknown>)
          : (row.message as Record<string, unknown>);
    } catch {
      msg = null;
    }

    let session = list.value.find((s) => s.id === sid);
    const isNew = !session;
    if (!session) {
      session = {
        id: sid,
        count: 0,
        latest: ts,
        earliest: ts,
        tools: [],
        typeCounts: { human: 0, ai: 0, tool: 0, system: 0 },
        categories: [],
        requestTypes: [],
        hasVerified: false,
        hasEndConversation: false,
        project: null,
        visitorType: null,
        language: null,
        validation: false,
        isWhatsapp: false,
        hasLead: false,
        hasCase: false,
        hasBooking: false,
        requestId: null,
        maskedClientPhone: null,
        conversationId: null,
      };
      list.value.unshift(session);
      // Lazy-load visitor enrichment so badges populate without blocking.
      // Re-find via the reactive list so writes go through Vue's proxy —
      // assigning to the raw `session` reference would bypass it.
      apiFetchEnrichment(sid).then((vs) => {
        if (!vs) return;
        const proxied = list.value.find((s) => s.id === sid);
        if (!proxied) return;
        Object.assign(proxied, vs);
      });
    }

    session.count += 1;
    if (ts > session.latest) session.latest = ts;
    if (ts < session.earliest) session.earliest = ts;

    if (msg) {
      const type = msg.type as keyof typeof session.typeCounts;
      if (type in session.typeCounts) session.typeCounts[type] += 1;

      const toolCalls = Array.isArray(msg.tool_calls)
        ? (msg.tool_calls as { name?: string }[])
        : [];
      for (const tc of toolCalls) {
        if (tc.name && !session.tools.includes(tc.name)) session.tools.push(tc.name);
      }
      if (type === 'tool' && typeof msg.name === 'string') {
        if (!session.tools.includes(msg.name)) session.tools.push(msg.name);
      }

      if (type === 'ai' && toolCalls.length === 0) {
        const out = parseAndExtractAiOutput(msg.content);
        if (out) {
          const cat = out.request_category;
          const rtype = out.request_type;
          if (typeof cat === 'string' && !session.categories.includes(cat)) session.categories.push(cat);
          if (typeof rtype === 'string' && !session.requestTypes.includes(rtype)) session.requestTypes.push(rtype);
          if (out.identity_verified) session.hasVerified = true;
          if (out.end_conversation) session.hasEndConversation = true;
        }
      }
    }

    // Move to front (newest activity) if not new — unshift already handled
    // the new-session case.
    if (!isNew) {
      const idx = list.value.indexOf(session);
      if (idx > 0) {
        list.value.splice(idx, 1);
        list.value.unshift(session);
      }
    }

    // Mirror into the open chat so the bubble pops in without a refetch.
    if (row.session_id && row.created_at) {
      const messages = useMessagesStore();
      messages.appendRow(row as ChatMessageRow);
    }
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
        // Tier 1: exact match on chat_messages.session_id, falling back to
        // visitors_settings.conversation_id. Index-backed, instant — works
        // for sessions of any age. Fetch visitor enrichment in parallel so
        // the single result lands with all badges already populated (no
        // post-render flicker as enrichment trickles in).
        const exact = await apiExactLookup(trimmed);
        if (myEpoch !== searchEpoch) return;
        if (exact) {
          const vs = await apiFetchEnrichment(exact.id).catch(() => null);
          if (myEpoch !== searchEpoch) return;
          if (vs) Object.assign(exact, vs);
          searchResults.value = [exact];
          searchError.value = null;
          return;
        }

        // Tier 2: RPC ILIKE substring search across the 3-day window. The
        // RPC already LEFT JOINs visitors_settings so each row arrives
        // fully enriched — no extra fetch needed.
        const results = await apiSearch(trimmed);
        if (myEpoch !== searchEpoch) return;
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
   *
   * Clears only the list/page state — search query, current selection, and
   * reviewed-set are preserved so a URL-driven `?q=…&session=…` deep link
   * survives the first-mount load.
   */
  async function loadDefault(): Promise<void> {
    loading.value = true;
    error.value = null;
    list.value = [];
    cursor.value = null;
    noMore.value = false;

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
    verifiedFilter,
    endConvFilter,
    reviewedIds,
    filterOptions,
    loadFilterOptions,
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
