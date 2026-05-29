<script setup lang="ts">
import { ref, watch } from 'vue';
import { useMessagesStore } from '@/stores/messages';

const messages = useMessagesStore();

const query = ref('');
const countLabel = ref('');
let matches: HTMLElement[] = [];
let activeIdx = -1;
let debounceHandle: ReturnType<typeof setTimeout> | null = null;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Remove all <mark.search-highlight> wrappers, restoring original text nodes. */
function clearHighlights(container: HTMLElement) {
  container.querySelectorAll('mark.search-highlight').forEach((m) => {
    const parent = m.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(m.textContent ?? ''), m);
    parent.normalize();
  });
  matches = [];
  activeIdx = -1;
}

/** Wrap matching substrings inside .message-text and .tool-details pre with <mark>. */
function performSearch(container: HTMLElement, q: string) {
  clearHighlights(container);
  if (!q || q.length < 2) {
    countLabel.value = '';
    return;
  }
  const regex = new RegExp(escapeRegex(q), 'gi');
  const targets = container.querySelectorAll<HTMLElement>('.message-text, .tool-details pre');

  targets.forEach((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);

    for (const node of nodes) {
      const text = node.textContent ?? '';
      regex.lastIndex = 0;
      if (!regex.test(text)) continue;
      regex.lastIndex = 0;

      const frag = document.createDocumentFragment();
      let lastIdx = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(text)) !== null) {
        if (m.index > lastIdx) frag.appendChild(document.createTextNode(text.slice(lastIdx, m.index)));
        const mark = document.createElement('mark');
        mark.className = 'search-highlight';
        mark.textContent = m[0];
        frag.appendChild(mark);
        lastIdx = regex.lastIndex;
      }
      if (lastIdx < text.length) frag.appendChild(document.createTextNode(text.slice(lastIdx)));
      node.parentNode?.replaceChild(frag, node);
    }
  });

  matches = Array.from(container.querySelectorAll<HTMLElement>('mark.search-highlight'));
  countLabel.value = matches.length ? `0 / ${matches.length}` : 'No results';
  if (matches.length) navigate(1);
}

function navigate(dir: 1 | -1) {
  if (!matches.length) return;
  if (activeIdx >= 0 && matches[activeIdx]) matches[activeIdx].classList.remove('active');
  activeIdx += dir;
  if (activeIdx >= matches.length) activeIdx = 0;
  if (activeIdx < 0) activeIdx = matches.length - 1;
  const m = matches[activeIdx];
  m.classList.add('active');
  m.scrollIntoView({ behavior: 'smooth', block: 'center' });
  countLabel.value = `${activeIdx + 1} / ${matches.length}`;
}

function onInput(e: Event) {
  const v = (e.target as HTMLInputElement).value;
  query.value = v;
  if (debounceHandle) clearTimeout(debounceHandle);
  debounceHandle = setTimeout(() => {
    if (messages.containerEl) performSearch(messages.containerEl, v);
  }, 300);
}

function onPrev() {
  navigate(-1);
}
function onNext() {
  navigate(1);
}

// Reset on session change — old highlights live on a now-discarded DOM,
// but the input still shows the stale query unless we clear.
watch(
  () => messages.sessionId,
  () => {
    query.value = '';
    countLabel.value = '';
    matches = [];
    activeIdx = -1;
    if (debounceHandle) clearTimeout(debounceHandle);
  },
);
</script>

<template>
  <div class="session-search-bar">
    <input type="text" placeholder="Search messages..." :value="query" @input="onInput" />
    <span class="session-search-count">{{ countLabel }}</span>
    <div class="session-search-nav">
      <button title="Previous match" @click="onPrev">&#9650;</button>
      <button title="Next match" @click="onNext">&#9660;</button>
    </div>
  </div>
</template>

<style scoped>
.session-search-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 5px 8px;
}
.session-search-bar input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 12px;
  background: transparent;
  color: var(--text-primary);
  min-width: 0;
}
.session-search-bar input::placeholder {
  color: var(--text-secondary);
}
.session-search-count {
  font-size: 10px;
  color: var(--text-secondary);
  white-space: nowrap;
}
.session-search-nav {
  display: flex;
  align-items: center;
  gap: 1px;
}
.session-search-nav button {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-secondary);
  padding: 1px 3px;
  border-radius: var(--radius-sm);
  line-height: 1;
}
.session-search-nav button:hover {
  background: var(--border);
  color: var(--text-primary);
}
</style>
