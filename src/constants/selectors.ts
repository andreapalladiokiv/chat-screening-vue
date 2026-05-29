/**
 * CSS selectors used by code that reaches into the messages-container
 * DOM (in-session search, quick-jump). Centralised so a rename of the
 * underlying class in MessageBubble.vue ripples without grep-archaeology.
 */
export const Selectors = {
  /** Wrappers around individual bubbles (see MessageBubble.vue). */
  messageWrapper: {
    ai: '.message-wrapper.ai',
    tool: '.message-wrapper.tool',
    last: '.message-wrapper:last-of-type',
  },

  /** Text-containing elements that in-session search walks for highlights. */
  searchableText: '.message-text, .tool-details pre',

  /** Highlight markers injected by InSessionSearch via DOM mutation. */
  searchHighlight: 'mark.search-highlight',
} as const;
