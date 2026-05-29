import type { ChatMessageRow } from '@/types/message';
import type { Session, TypeCounts } from '@/types/session';

/**
 * Build a Session metadata object client-side from raw chat_messages rows.
 *
 * Used by the search tier-1 fast path when we found a matching session by
 * exact id and need to render it without going through `get_session_list`
 * (the RPC would have been slow for an arbitrary id outside the 3-day
 * default window). Visitor enrichment is left null — caller fills it via
 * fetchVisitorEnrichment.
 *
 * Same accumulation logic as the realtime INSERT handler — kept independent
 * to avoid coupling search to the realtime store.
 */
export function buildSessionFromMessages(sessionId: string, rows: ChatMessageRow[]): Session {
  const typeCounts: TypeCounts = { human: 0, ai: 0, tool: 0, system: 0 };
  const toolSet = new Set<string>();
  const categorySet = new Set<string>();
  const requestTypeSet = new Set<string>();
  let hasVerified = false;
  let hasEndConversation = false;

  for (const row of rows) {
    let msg: Record<string, unknown> | null = null;
    try {
      msg = (typeof row.message === 'string'
        ? JSON.parse(row.message)
        : row.message) as Record<string, unknown> | null;
    } catch {
      continue;
    }
    if (!msg) continue;

    const type = (msg.type as keyof TypeCounts) ?? 'system';
    if (type in typeCounts) typeCounts[type] += 1;

    const toolCalls = Array.isArray(msg.tool_calls) ? (msg.tool_calls as { name?: string }[]) : [];
    for (const tc of toolCalls) {
      if (tc.name) toolSet.add(tc.name);
    }
    if (type === 'tool' && typeof msg.name === 'string') {
      toolSet.add(msg.name);
    }

    if (type === 'ai' && toolCalls.length === 0) {
      let content: unknown = msg.content;
      if (typeof content === 'string') {
        try { content = JSON.parse(content); } catch { content = null; }
      }
      let out: Record<string, unknown> | null = null;
      if (content && typeof content === 'object') {
        const c = content as Record<string, unknown>;
        if (c.output && typeof c.output === 'object') out = c.output as Record<string, unknown>;
        else if (typeof c.text !== 'undefined') out = c;
      }
      if (out) {
        if (typeof out.request_category === 'string') categorySet.add(out.request_category);
        if (typeof out.request_type === 'string') requestTypeSet.add(out.request_type);
        if (out.identity_verified) hasVerified = true;
        if (out.end_conversation) hasEndConversation = true;
      }
    }
  }

  return {
    id: sessionId,
    count: rows.length,
    latest: rows[rows.length - 1]?.created_at ?? new Date().toISOString(),
    earliest: rows[0]?.created_at ?? new Date().toISOString(),
    tools: [...toolSet],
    typeCounts,
    categories: [...categorySet],
    requestTypes: [...requestTypeSet],
    hasVerified,
    hasEndConversation,
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
}
