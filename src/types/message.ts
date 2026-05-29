/**
 * Raw row shape from chat_messages, used by the message loader before
 * parsing into a typed ParsedMessage. The `message` JSONB column carries
 * the actual conversation payload.
 */
export interface ChatMessageRow {
  session_id: string;
  created_at: string;
  /** May be a JSON string or an already-parsed object. */
  message: unknown;
}

/** A tool call attached to an AI message. */
export interface ToolCall {
  name?: string;
  args?: unknown;
  input?: unknown;
  id?: string;
}

/** Metadata extracted from AI final responses — supports wrapped + flat formats. */
export interface AiMeta {
  requestCategory?: string;
  requestType?: string;
  identityVerified?: boolean;
  endConversation?: boolean;
}

export interface HumanMessage {
  type: 'human';
  text: string;
  timestamp: string;
  raw: unknown;
}

export interface AiFinalMessage {
  type: 'ai';
  hasToolCalls: false;
  text: string;
  meta: AiMeta | null;
  timestamp: string;
  raw: unknown;
}

export interface AiWithToolsMessage {
  type: 'ai';
  hasToolCalls: true;
  text: string;
  toolCalls: ToolCall[];
  timestamp: string;
  raw: unknown;
}

export interface ToolResultMessage {
  type: 'tool';
  toolName: string;
  toolCallId: string;
  text: string;
  timestamp: string;
  raw: unknown;
}

export interface SystemMessage {
  type: 'system';
  text: string;
  /** When non-null, render as a label/value grid instead of plain text. */
  systemParsed: Record<string, unknown> | null;
  timestamp: string;
  raw: unknown;
}

export interface UnknownMessage {
  type: 'unknown';
  text: string;
  timestamp: string;
  raw: unknown;
}

export type ParsedMessage =
  | HumanMessage
  | AiFinalMessage
  | AiWithToolsMessage
  | ToolResultMessage
  | SystemMessage
  | UnknownMessage;
