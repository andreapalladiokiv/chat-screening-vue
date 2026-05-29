import type { AiMeta, ParsedMessage } from '@/types/message';

/**
 * Find the meta from the LAST AI final response in the parsed message
 * stream — used for the "Result" badges in the detail sidebar.
 *
 * Returns null when no AI final response has meta worth surfacing
 * (or there's no AI final at all).
 */
export function lastAiClassification(parsed: ParsedMessage[]): AiMeta | null {
  for (let i = parsed.length - 1; i >= 0; i--) {
    const m = parsed[i];
    if (m.type === 'ai' && !m.hasToolCalls && m.meta) {
      const meta = m.meta;
      if (
        meta.requestCategory ||
        meta.requestType ||
        meta.identityVerified ||
        meta.endConversation
      ) {
        return meta;
      }
    }
  }
  return null;
}
