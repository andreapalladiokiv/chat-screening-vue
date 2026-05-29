import { getSupabaseClient } from '@/api/supabase';
import type { Session, SessionRpcRow } from '@/types/session';

const DEFAULT_LIMIT = 50;
const PAGE_LIMIT = 10;
const RPC_TIMEOUT_MS = 15_000;
const DEFAULT_WINDOW_DAYS = 3;
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
 * Initial load — last 3 days, capped at 50 sessions. Caller decides whether
 * to retry on failure (the sessions store does). The 3-day default mirrors
 * legacy behaviour: scopes the Stage-1 GROUP BY scan to avoid full-table cost.
 */
export async function loadDefaultSessions(): Promise<Session[]> {
  const now = new Date();
  const since = new Date(now.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return callRpc(
    toRpcParams(DEFAULT_LIMIT, {
      dateFrom: since.toISOString(),
      dateTo: now.toISOString(),
    }),
  );
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

/**
 * Server-side substring search via the RPC's p_session_id parameter (ILIKE
 * against chat_messages.session_id and visitors_settings.conversation_id).
 * Times out at RPC_TIMEOUT_MS like the regular load — surface the error so
 * the UI can show "Search failed" instead of an empty list.
 */
export async function searchSessions(query: string): Promise<Session[]> {
  return callRpc(toRpcParams(DEFAULT_LIMIT, { sessionId: query }));
}
