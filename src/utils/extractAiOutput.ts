/**
 * Resolve the "output object" from an AI message's `content` field, tolerating
 * both the wrapped (`content.output.<field>`) and flat (`content.<field>`)
 * formats that the bot can emit.
 *
 * Returns:
 *   - object → use `out.text`, `out.request_category`, etc.
 *   - null   → content isn't structured AI output (plain text or unparseable)
 *
 * Caller is responsible for parsing `msg.content` if it's a string — pass
 * the already-parsed value. This stays a pure function so it's trivial to
 * unit-test.
 *
 * Single source of truth used by:
 *   - utils/parseMessage.ts          (final AI bubble extraction)
 *   - utils/buildSession.ts          (session aggregation client-side)
 *   - stores/sessions.ts             (realtime INSERT aggregation)
 */
export function extractAiOutput(content: unknown): Record<string, unknown> | null {
  if (!content || typeof content !== 'object') return null;
  const c = content as Record<string, unknown>;
  if (c.output && typeof c.output === 'object') {
    return c.output as Record<string, unknown>;
  }
  if (typeof c.text !== 'undefined') {
    return c;
  }
  return null;
}

/**
 * Convenience helper: parse `content` (string-or-object) then extract.
 * Used by callers that read `msg.content` directly without pre-parsing.
 */
export function parseAndExtractAiOutput(content: unknown): Record<string, unknown> | null {
  let parsed: unknown = content;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  return extractAiOutput(parsed);
}
