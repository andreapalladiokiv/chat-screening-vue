export interface TypeCounts {
  human: number;
  ai: number;
  tool: number;
  system: number;
}

export interface Session {
  id: string;
  count: number;
  latest: string;
  earliest: string;
  tools: string[];
  typeCounts: TypeCounts;
  categories: string[];
  requestTypes: string[];
  hasVerified: boolean;
  hasEndConversation: boolean;
  // Visitor settings enrichment (null when visitors_settings has no row)
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

/**
 * Raw row shape returned by the `get_session_list` Postgres RPC. snake_case
 * because PG returns columns as-is; the front-end maps these into Session
 * via parseSessionResults.
 */
export interface SessionRpcRow {
  session_id: string;
  msg_count: number | string;
  latest: string;
  earliest: string;
  tools?: string[] | null;
  type_counts?: TypeCounts | null;
  categories?: string[] | null;
  request_types?: string[] | null;
  has_verified?: boolean | null;
  has_end_conversation?: boolean | null;
  project?: string | null;
  visitor_type?: string | null;
  language?: string | null;
  validation?: boolean | null;
  is_whatsapp?: boolean | null;
  has_lead?: boolean | null;
  has_case?: boolean | null;
  has_booking?: boolean | null;
  request_id?: string | null;
  masked_client_phone?: string | null;
  conversation_id?: string | null;
}
