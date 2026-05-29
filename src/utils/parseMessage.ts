import { extractAiOutput } from '@/utils/extractAiOutput';
import type {
  AiMeta,
  ChatMessageRow,
  ParsedMessage,
  ToolCall,
} from '@/types/message';

/**
 * Parse a chat_messages row into a typed ParsedMessage. Mirrors legacy
 * parseMessage:
 *
 *   - 'human'   → plain text (handles nested JSON {text/content/input})
 *   - 'ai' with non-empty tool_calls → AiWithToolsMessage
 *   - 'ai' (final) → parse content JSON, prefer wrapped (content.output.X)
 *                    else flat (content.X). Extract text + meta fields.
 *   - 'tool'    → tool result with optional structured content
 *   - 'system'  → parse content; if object, structured grid (systemParsed),
 *                 else plain text.
 *   - anything else → 'unknown' with stringified text.
 */
export function parseMessage(row: ChatMessageRow): ParsedMessage {
  let msg: Record<string, unknown>;
  try {
    msg = (typeof row.message === 'string'
      ? JSON.parse(row.message)
      : row.message) as Record<string, unknown>;
  } catch {
    return {
      type: 'unknown',
      text: typeof row.message === 'string' ? row.message : JSON.stringify(row.message),
      timestamp: row.created_at,
      raw: row.message,
    };
  }

  const type = (msg.type as string) ?? 'unknown';
  const timestamp = row.created_at;
  const raw = msg;

  if (type === 'human') {
    let text = msg.content;
    if (typeof text === 'string') {
      try {
        const parsed = JSON.parse(text);
        text =
          parsed.text ?? parsed.content ?? parsed.input ?? JSON.stringify(parsed, null, 2);
      } catch {
        /* plain text */
      }
    }
    return {
      type: 'human',
      text: typeof text === 'string' ? text : JSON.stringify(text ?? '', null, 2),
      timestamp,
      raw,
    };
  }

  if (type === 'ai') {
    const toolCalls = Array.isArray(msg.tool_calls) ? (msg.tool_calls as ToolCall[]) : [];
    const hasToolCalls = toolCalls.length > 0;

    if (hasToolCalls) {
      return {
        type: 'ai',
        hasToolCalls: true,
        text: typeof msg.content === 'string' ? msg.content : '',
        toolCalls,
        timestamp,
        raw,
      };
    }

    // Final AI response — content may be JSON string (wrapped or flat) or already parsed.
    let content: unknown = msg.content;
    if (typeof content === 'string') {
      try {
        content = JSON.parse(content);
      } catch {
        return {
          type: 'ai',
          hasToolCalls: false,
          text: content as string,
          meta: null,
          timestamp,
          raw,
        };
      }
    }

    // Wrapped (content.output.X) vs flat (content.X). Single source of
    // truth in utils/extractAiOutput.ts.
    const out = extractAiOutput(content);

    if (out) {
      const meta: AiMeta = {
        requestCategory: typeof out.request_category === 'string' ? out.request_category : undefined,
        requestType: typeof out.request_type === 'string' ? out.request_type : undefined,
        identityVerified: typeof out.identity_verified === 'boolean' ? out.identity_verified : undefined,
        endConversation: typeof out.end_conversation === 'boolean' ? out.end_conversation : undefined,
      };
      return {
        type: 'ai',
        hasToolCalls: false,
        text: typeof out.text === 'string' ? out.text : '',
        meta,
        timestamp,
        raw,
      };
    }

    return {
      type: 'ai',
      hasToolCalls: false,
      text: typeof content === 'string' ? content : JSON.stringify(content ?? '', null, 2),
      meta: null,
      timestamp,
      raw,
    };
  }

  if (type === 'tool') {
    const toolName = (msg.name as string) ?? 'Tool';
    const toolCallId = (msg.tool_call_id as string) ?? '';
    let content: unknown = msg.content;
    if (typeof content === 'string') {
      try {
        content = JSON.parse(content);
      } catch {
        /* plain text */
      }
    }
    return {
      type: 'tool',
      toolName,
      toolCallId,
      text: typeof content === 'string' ? content : JSON.stringify(content ?? '', null, 2),
      timestamp,
      raw,
    };
  }

  if (type === 'system') {
    let content: unknown = msg.content;
    if (typeof content === 'string') {
      try {
        content = JSON.parse(content);
      } catch {
        return {
          type: 'system',
          text: content,
          systemParsed: null,
          timestamp,
          raw,
        };
      }
    }
    if (content && typeof content === 'object' && Object.keys(content).length > 0) {
      const obj = content as Record<string, unknown>;
      const labels: Record<string, string> = {
        session_id: 'Session',
        client_id: 'Client',
        platform: 'Platform',
        project: 'Project',
      };
      const text = Object.keys(obj)
        .map((k) => {
          const label = labels[k] ?? k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
          return `${label}: ${obj[k]}`;
        })
        .join(' · ');
      return { type: 'system', text, systemParsed: obj, timestamp, raw };
    }
    return {
      type: 'system',
      text: typeof content === 'string' ? content : JSON.stringify(content ?? '', null, 2),
      systemParsed: null,
      timestamp,
      raw,
    };
  }

  return {
    type: 'unknown',
    text: JSON.stringify(msg, null, 2),
    timestamp,
    raw,
  };
}

/** Pretty-print tool call args as a JSON string (multiple calls separated by ---). */
export function formatToolCallArgs(toolCalls: ToolCall[]): string {
  return toolCalls
    .map((tc) => {
      const args = tc.args ?? tc.input ?? {};
      return JSON.stringify(args, null, 2);
    })
    .join('\n---\n');
}
