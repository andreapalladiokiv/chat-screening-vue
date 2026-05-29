<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Session } from '@/types/session';
import { formatSessionMeta } from '@/utils/formatDate';

const props = defineProps<{
  session: Session;
  active: boolean;
}>();

defineEmits<{
  (e: 'select', id: string): void;
}>();

const displayId = computed(() => props.session.conversationId || props.session.id);
const metaLine = computed(() => formatSessionMeta(props.session.count, props.session.latest));

const pills = computed(() => {
  const tc = props.session.typeCounts;
  const parts: { kind: 'human' | 'ai' | 'tool' | 'system'; n: number; label: string }[] = [];
  if (tc.human) parts.push({ kind: 'human', n: tc.human, label: 'human' });
  if (tc.ai) parts.push({ kind: 'ai', n: tc.ai, label: 'ai' });
  if (tc.tool) parts.push({ kind: 'tool', n: tc.tool, label: 'tool' });
  if (tc.system) parts.push({ kind: 'system', n: tc.system, label: 'sys' });
  return parts;
});

const hasVisitorEnrichment = computed(() =>
  !!(
    props.session.project ||
    props.session.visitorType ||
    props.session.language ||
    props.session.isWhatsapp ||
    props.session.validation ||
    props.session.hasLead ||
    props.session.hasCase ||
    props.session.hasBooking ||
    props.session.conversationId
  ),
);

const justCopied = ref(false);
async function copyId(e: Event) {
  e.stopPropagation();
  try {
    await navigator.clipboard.writeText(props.session.id);
    justCopied.value = true;
    setTimeout(() => (justCopied.value = false), 1200);
  } catch {
    // older browsers / missing clipboard permission
  }
}
</script>

<template>
  <li
    class="session-item"
    :class="{ active }"
    :data-session-id="session.id"
    @click="$emit('select', session.id)"
  >
    <div class="session-id" :title="session.id">{{ displayId
      }}<button
        class="session-id-copy-btn"
        :class="{ copied: justCopied }"
        title="Copy session ID"
        @click="copyId"
      >&#x2398;</button>
    </div>
    <div class="session-meta">{{ metaLine }}</div>

    <div v-if="pills.length" class="type-counts">
      <span v-for="p in pills" :key="p.kind" class="type-pill" :class="p.kind">
        {{ p.n }} {{ p.label }}
      </span>
    </div>

    <div class="session-badges">
      <span v-if="session.project" class="badge badge-project">{{ session.project }}</span>
      <span v-if="session.visitorType" class="badge badge-visitor-type">{{ session.visitorType }}</span>
      <span v-if="!hasVisitorEnrichment" class="badge badge-no-visitor">no visitor data</span>
      <span v-for="cat in session.categories" :key="`c-${cat}`" class="badge">{{ cat }}</span>
      <span v-for="rt in session.requestTypes" :key="`r-${rt}`" class="badge">{{ rt }}</span>
      <span v-if="session.hasVerified" class="badge verified">verified</span>
      <span v-if="session.hasEndConversation" class="badge end-conv">end</span>
    </div>
  </li>
</template>

<style scoped>
.session-item {
  padding: 14px 10px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.15s;
}
.session-item:hover {
  background: var(--bg);
}
.session-item.active {
  background: var(--bg);
  border-left: 3px solid var(--accent);
}

.session-id {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 4px;
}

.session-id-copy-btn {
  background: none;
  border: none;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 1px 3px;
  border-radius: 3px;
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
  /* Optical correction: U+2398 sits low inside its em-box. */
  transform: translateY(-1px);
}
.session-item:hover .session-id-copy-btn {
  opacity: 1;
}
.session-id-copy-btn:hover {
  color: var(--accent);
}
.session-id-copy-btn.copied {
  color: var(--accent);
}

.session-meta {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.type-counts {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.type-pill {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 10px;
}
.type-pill.human {
  background: var(--pill-human-bg);
  color: var(--pill-human-text);
}
.type-pill.ai {
  background: var(--badge-bg);
  color: var(--badge-text);
}
.type-pill.tool {
  background: var(--tool-bg);
  color: var(--tool-text);
}
.type-pill.system {
  background: var(--bg);
  color: var(--text-secondary);
}

.session-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-top: 3px;
}
.badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: var(--radius-lg);
  background: var(--badge-bg);
  color: var(--badge-text);
}
.badge.badge-project {
  background: var(--badge-project-bg);
  color: var(--badge-project-text);
}
.badge.badge-visitor-type {
  background: var(--badge-visitor-bg);
  color: var(--badge-visitor-text);
}
.badge.verified {
  background: var(--badge-verified-bg);
  color: var(--badge-verified-text);
}
.badge.end-conv {
  background: var(--badge-end-bg);
  color: var(--badge-end-text);
}
.badge.badge-no-visitor {
  background: transparent;
  color: var(--text-secondary);
  border: 1px dashed var(--border);
  font-style: italic;
}
</style>
