import { getSupabaseClient } from '@/api/supabase';
import { buildSessionFromMessages } from '@/utils/buildSession';
import type { ChatMessageRow } from '@/types/message';
import type { Session, SessionRpcRow } from '@/types/session';

const DEFAULT_LIMIT = 50;
const PAGE_LIMIT = 10;
const RPC_TIMEOUT_MS = 15_000;
export const FILTER_DATE_RANGE_MAX_DAYS = 7;

export interface SessionFilterParams {
  // Mirrors get_session_list RPC params. All optional — omit = no filter.
  // The TS keys are camelCase; the SQL params are snake-cased on the wire.
  dateFrom?: string;
  dateTo?: string;
  msgMin?: number;
  msgMax?: number;
  tools?: string[];
  categories?: string[];
  requestTypes?: string[];
  projects?: string[];
  visitorTypes?: string[];
  languages?: string[];
  validation?: boolean;
  isWhatsapp?: boolean;
  hasLead?: boolean;
  hasCase?: boolean;
  hasBooking?: boolean;
  sessionId?: string;
}

interface RpcParams extends Record<string, unknown> {
  p_limit: number;
  p_cursor?: string | null;
}

function toRpcParams(limit: number, filters: SessionFilterParams = {}, cursor: string | null = null): RpcParams {
  const p: RpcParams = { p_limit: limit };
  if (cursor) p.p_cursor = cursor;
  if (filters.dateFrom) p.p_date_from = filters.dateFrom;
  if (filters.dateTo) p.p_date_to = filters.dateTo;
  if (filters.msgMin != null) p.p_msg_min = filters.msgMin;
  if (filters.msgMax != null) p.p_msg_max = filters.msgMax;
  if (filters.tools?.length) p.p_tools = filters.tools;
  if (filters.categories?.length) p.p_categories = filters.categories;
  if (filters.requestTypes?.length) p.p_request_types = filters.requestTypes;
  if (filters.projects?.length) p.p_projects = filters.projects;
  if (filters.visitorTypes?.length) p.p_visitor_types = filters.visitorTypes;
  if (filters.languages?.length) p.p_languages = filters.languages;
  if (filters.validation != null) p.p_validation = filters.validation;
  if (filters.isWhatsapp != null) p.p_is_whatsapp = filters.isWhatsapp;
  if (filters.hasLead != null) p.p_has_lead = filters.hasLead;
  if (filters.hasCase != null) p.p_has_case = filters.hasCase;
  if (filters.hasBooking != null) p.p_has_booking = filters.hasBooking;
  if (filters.sessionId) p.p_session_id = filters.sessionId;
  return p;
}

export function parseSessionResults(rows: SessionRpcRow[] | null): Session[] {
  return (rows ?? []).map((row) => ({
    id: row.session_id,
    count: Number(row.msg_count),
    latest: row.latest,
    earliest: row.earliest,
    tools: row.tools ?? [],
    typeCounts: row.type_counts ?? { human: 0, ai: 0, tool: 0, system: 0 },
    categories: row.categories ?? [],
    requestTypes: row.request_types ?? [],
    hasVerified: row.has_verified ?? false,
    hasEndConversation: row.has_end_conversation ?? false,
    project: row.project ?? null,
    visitorType: row.visitor_type ?? null,
    language: row.language ?? null,
    validation: row.validation ?? false,
    isWhatsapp: row.is_whatsapp ?? false,
    hasLead: row.has_lead ?? false,
    hasCase: row.has_case ?? false,
    hasBooking: row.has_booking ?? false,
    requestId: row.request_id ?? null,
    maskedClientPhone: row.masked_client_phone ?? null,
    conversationId: row.conversation_id ?? null,
  }));
}

async function callRpc(params: RpcParams): Promise<Session[]> {
  const db = getSupabaseClient();
  const rpc = db.rpc('get_session_list', params);
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Session loading timed out')), RPC_TIMEOUT_MS),
  );
  const result = (await Promise.race([rpc, timeout])) as { data: SessionRpcRow[] | null; error: unknown };
  if (result.error) {
    const err = result.error as { message?: string; details?: string };
    throw new Error(err.message ?? err.details ?? 'get_session_list failed');
  }
  return parseSessionResults(result.data);
}

/**
 * Initial load — 50 most recent sessions, no date window.
 *
 * The RPC's loose index scan walks the (created_at DESC) index backwards
 * collecting distinct session_ids until p_limit, so cost is O(p_limit)
 * regardless of history size. No client-side window required — passing
 * dateFrom here would force the GROUP BY fallback path on the server.
 */
export async function loadDefaultSessions(): Promise<Session[]> {
  return callRpc(toRpcParams(DEFAULT_LIMIT));
}

/**
 * Load the next page using the current cursor (the `latest` timestamp of
 * the last item in the list). When filters are active, the same filters
 * are re-applied to keep the page contiguous with the visible set.
 */
export async function loadMoreSessions(
  cursor: string,
  filters: SessionFilterParams = {},
): Promise<Session[]> {
  return callRpc(toRpcParams(PAGE_LIMIT, filters, cursor));
}

/**
 * Load sessions matching the given filter params. Used by Apply Filters.
 */
export async function loadFilteredSessions(filters: SessionFilterParams): Promise<Session[]> {
  return callRpc(toRpcParams(DEFAULT_LIMIT, filters));
}

/** Visitor enrichment fields fetched per-session via direct table read.
 * Used by the realtime INSERT handler to fill in badges for sessions
 * that didn't come through the RPC. */
export interface VisitorEnrichment {
  project: string | null;
  visitorType: string | null;
  language: string | null;
  validation: boolean;
  isWhatsapp: boolean;
  hasLead: boolean;
  hasCase: boolean;
  hasBooking: boolean;
  requestId: string | null;
  maskedClientPhone: string | null;
  conversationId: string | null;
}

export async function fetchVisitorEnrichment(sessionId: string): Promise<VisitorEnrichment | null> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('visitors_settings')
    .select(
      'project, type, language, validation, is_whatsapp, lead_id, case_id, booking_identifier, request_id, masked_client_phone, conversation_id',
    )
    .eq('session_id', sessionId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    project: data.project ?? null,
    visitorType: data.type ?? null,
    language: data.language ?? null,
    validation: data.validation ?? false,
    isWhatsapp: data.is_whatsapp ?? false,
    hasLead: data.lead_id != null,
    hasCase: data.case_id != null,
    hasBooking: data.booking_identifier != null,
    requestId: data.request_id ?? null,
    maskedClientPhone: data.masked_client_phone ?? null,
    conversationId: data.conversation_id ?? null,
  };
}

/**
 * Server-side substring search via the RPC's p_session_id parameter (ILIKE
 * against chat_messages.session_id and visitors_settings.conversation_id).
 * Times out at RPC_TIMEOUT_MS like the regular load — surface the error so
 * the UI can show "Search failed" instead of an empty list.
 */
export async function searchSessions(query: string): Promise<Session[]> {
  return callRpc(toRpcParams(DEFAULT_LIMIT, { sessionId: query }));
}

/**
 * Tier-1 search: exact match against chat_messages.session_id, or its
 * fallback chain through visitors_settings.conversation_id → session_id.
 * Builds the Session metadata client-side from the resolved rows. Returns
 * null when neither path matches.
 *
 * Faster than the RPC ILIKE for known-id navigation (e.g. paste a session
 * id into search) and works for sessions older than the 3-day default
 * window. The caller layers the RPC fallback on top.
 */
export async function tryExactSessionLookup(query: string): Promise<Session | null> {
  const db = getSupabaseClient();

  // 1. Direct hit on chat_messages.session_id.
  const direct = await db
    .from('chat_messages')
    .select('session_id, created_at, message')
    .eq('session_id', query)
    .order('created_at', { ascending: true });
  let rows = (direct.data ?? []) as ChatMessageRow[];
  let sessionId = query;

  if (rows.length === 0) {
    // 2. Resolve via visitors_settings.conversation_id, then re-read chat_messages.
    const vs = await db
      .from('visitors_settings')
      .select('session_id')
      .eq('conversation_id', query)
      .limit(1)
      .maybeSingle();
    if (!vs.data || !vs.data.session_id) return null;
    sessionId = vs.data.session_id as string;
    const second = await db
      .from('chat_messages')
      .select('session_id, created_at, message')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    rows = (second.data ?? []) as ChatMessageRow[];
    if (rows.length === 0) return null;
  }

  return buildSessionFromMessages(sessionId, rows);
}

/**
 * The shape returned by the get_filter_options RPC. Keys come back from PG
 * in snake_case; the front-end keeps them as-is for parity with legacy.
 */
export interface FilterOptions {
  tools: string[];
  categories: string[];
  request_types: string[];
  projects: string[];
  visitor_types: string[];
  languages: string[];
}

/**
 * Load the set of values that populate the filter popover's multi-selects.
 * Times out at 10s to match legacy; on failure we return empty arrays
 * (filter popover will simply show "no options" — non-fatal).
 */
export async function loadFilterOptions(): Promise<FilterOptions> {
  const db = getSupabaseClient();
  const rpc = db.rpc('get_filter_options');
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('get_filter_options timed out')), 10_000),
  );
  try {
    const result = (await Promise.race([rpc, timeout])) as {
      data: Partial<FilterOptions> | null;
      error: unknown;
    };
    if (result.error) throw result.error;
    const d = result.data ?? {};
    return {
      tools: [...(d.tools ?? [])].sort(),
      categories: [...(d.categories ?? [])].sort(),
      request_types: [...(d.request_types ?? [])].sort(),
      projects: [...(d.projects ?? [])].sort(),
      visitor_types: [...(d.visitor_types ?? [])].sort(),
      languages: [...(d.languages ?? [])].sort(),
    };
  } catch (err) {
    console.warn('[filters] loadFilterOptions failed:', err);
    return { tools: [], categories: [], request_types: [], projects: [], visitor_types: [], languages: [] };
  }
}
