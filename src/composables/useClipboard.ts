import { ref } from 'vue';

/**
 * Tiny composable for "copy text + briefly show feedback" buttons.
 * Used by:
 *   - SessionListItem copy-id button
 *   - MessageBubble copy-message button
 *   - DetailSidebar (potential future use)
 *
 * The `justCopied` ref flips to true after a successful copy and back to
 * false after `resetMs` (default 1.2s) — bind it to a class to flash the
 * button green.
 */
export function useClipboard(resetMs = 1200) {
  const justCopied = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function copy(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      justCopied.value = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        justCopied.value = false;
        timer = null;
      }, resetMs);
      return true;
    } catch {
      // Older browser / blocked permission — silently fail.
      return false;
    }
  }

  return { justCopied, copy };
}
