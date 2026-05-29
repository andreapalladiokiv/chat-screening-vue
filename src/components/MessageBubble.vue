<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ParsedMessage } from '@/types/message';
import { formatTime } from '@/utils/formatDate';
import { formatToolCallArgs } from '@/utils/parseMessage';
import { useMessagesStore } from '@/stores/messages';
import { useSessionsStore } from '@/stores/sessions';
import { useFeedbackStore } from '@/stores/feedback';

const props = defineProps<{ parsed: ParsedMessage; index: number }>();
const messages = useMessagesStore();
const sessions = useSessionsStore();
const feedback = useFeedbackStore();

const justCopied = ref(false);
async function onCopy() {
  try {
    await navigator.clipboard.writeText(props.parsed.text);
    justCopied.value = true;
    setTimeout(() => (justCopied.value = false), 1200);
  } catch {
    // ignore
  }
}

function onFeedback() {
  const s = sessions.current;
  if (!s) return;
  const toolName =
    props.parsed.type === 'tool'
      ? props.parsed.toolName
      : props.parsed.type === 'ai' && props.parsed.hasToolCalls
        ? props.parsed.toolCalls.map((tc) => tc.name ?? '').filter(Boolean).join(', ') || undefined
        : undefined;
  feedback.openMessageFeedback({
    type: 'message',
    session_id: s.id,
    message_index: props.index,
    message_type: props.parsed.type,
    message_timestamp: props.parsed.timestamp,
    message_text_excerpt: (props.parsed.text ?? '').substring(0, 200),
    tool_name: toolName,
    raw_message: props.parsed.raw,
  });
}

const wrapperClass = computed(() => {
  // AI-with-tools renders in the "tool" lane (centered, yellow), per legacy.
  if (props.parsed.type === 'ai' && props.parsed.hasToolCalls) return 'message-wrapper tool';
  return `message-wrapper ${props.parsed.type}`;
});

const toolCallNames = computed(() => {
  if (props.parsed.type !== 'ai' || !props.parsed.hasToolCalls) return '';
  return props.parsed.toolCalls.map((tc) => tc.name ?? 'unknown').join(', ');
});

const toolCallArgs = computed(() => {
  if (props.parsed.type !== 'ai' || !props.parsed.hasToolCalls) return '';
  return formatToolCallArgs(props.parsed.toolCalls);
});

const systemEntries = computed(() => {
  if (props.parsed.type !== 'system' || !props.parsed.systemParsed) return null;
  const labels: Record<string, string> = {
    session_id: 'Session',
    client_id: 'Client',
    platform: 'Platform',
    project: 'Project',
  };
  return Object.entries(props.parsed.systemParsed).map(([k, v]) => ({
    label: labels[k] ?? k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    value: String(v),
  }));
});
</script>

<template>
  <div :class="wrapperClass">
    <!-- HUMAN -->
    <div v-if="parsed.type === 'human'" class="message human-bubble">
      <div class="message-label human-label">Customer</div>
      <div class="message-text">{{ parsed.text }}</div>
      <div class="message-time">{{ formatTime(parsed.timestamp) }}</div>
    </div>

    <!-- AI WITH TOOL CALLS -->
    <div v-else-if="parsed.type === 'ai' && parsed.hasToolCalls" class="message tool-bubble">
      <div class="message-label tool-label">Tool Call: {{ toolCallNames }}</div>
      <div v-if="parsed.text" class="message-text">{{ parsed.text }}</div>
      <details class="tool-details" :open="messages.allToolDetailsOpen">
        <summary>Show tool call details</summary>
        <pre>{{ toolCallArgs }}</pre>
      </details>
      <div class="message-time">{{ formatTime(parsed.timestamp) }}</div>
    </div>

    <!-- AI FINAL -->
    <div v-else-if="parsed.type === 'ai'" class="message ai-bubble">
      <div class="message-label ai-label">AI Agent</div>
      <div class="message-text">{{ parsed.text }}</div>
      <div v-if="parsed.meta && (parsed.meta.requestCategory || parsed.meta.requestType || parsed.meta.identityVerified || parsed.meta.endConversation)" class="badges">
        <span v-if="parsed.meta.requestCategory" class="badge">{{ parsed.meta.requestCategory }}</span>
        <span v-if="parsed.meta.requestType" class="badge">{{ parsed.meta.requestType }}</span>
        <span v-if="parsed.meta.identityVerified" class="badge verified">verified</span>
        <span v-if="parsed.meta.endConversation" class="badge end-conv">end</span>
      </div>
      <div class="message-time">{{ formatTime(parsed.timestamp) }}</div>
    </div>

    <!-- TOOL RESULT -->
    <div v-else-if="parsed.type === 'tool'" class="message tool-bubble">
      <div class="message-label tool-label">Tool Result: {{ parsed.toolName }}</div>
      <details class="tool-details" :open="messages.allToolDetailsOpen">
        <summary>Show response</summary>
        <pre>{{ parsed.text }}</pre>
      </details>
      <div class="message-time">{{ formatTime(parsed.timestamp) }}</div>
    </div>

    <!-- SYSTEM (structured grid) -->
    <div v-else-if="parsed.type === 'system' && systemEntries" class="message system-bubble">
      <div class="system-grid">
        <template v-for="(e, i) in systemEntries" :key="i">
          <span class="system-grid-label">{{ e.label }}</span>
          <span class="system-grid-value">{{ e.value }}</span>
        </template>
      </div>
    </div>

    <!-- SYSTEM (plain text) / UNKNOWN -->
    <div v-else class="message system-bubble">
      <div class="message-text">{{ parsed.text }}</div>
    </div>

    <!-- Hover actions next to bubble (legacy parity: Copy + Feedback) -->
    <div class="msg-action-group">
      <button class="msg-copy-btn" :class="{ copied: justCopied }" title="Copy message text" @click="onCopy">
        {{ justCopied ? 'Copied!' : 'Copy' }}
      </button>
      <button class="feedback-hover-btn" title="Leave feedback on this message" @click="onFeedback">
        Feedback
      </button>
    </div>
  </div>
</template>

<style scoped>
.message-wrapper {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin-bottom: 2px;
  position: relative;
}
.message-wrapper.human { justify-content: flex-start; }
.message-wrapper.ai { justify-content: flex-end; }
.message-wrapper.system { justify-content: center; }
.message-wrapper.tool { justify-content: center; }

/* Hover action group (Copy + Feedback) sits next to the bubble. */
.msg-action-group {
  display: none;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
  padding-top: 2px;
}
.message-wrapper:hover .msg-action-group {
  display: flex;
}
/* AI rows render bubble on the right — push actions before the bubble. */
.message-wrapper.ai .msg-action-group {
  order: -1;
}
/* Centered rows (tool / system): place actions just outside the 80% bubble. */
.message-wrapper.tool,
.message-wrapper.system {
  position: relative;
}
.message-wrapper.tool .msg-action-group,
.message-wrapper.system .msg-action-group {
  position: absolute;
  left: calc(90% + 6px);
  top: 2px;
  flex-direction: row;
}

.msg-copy-btn,
.feedback-hover-btn {
  background: var(--sidebar-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 3px 6px;
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
  line-height: 1.2;
  white-space: nowrap;
}
.msg-copy-btn:hover,
.feedback-hover-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.msg-copy-btn.copied {
  color: var(--accent);
  border-color: var(--accent);
}

.message {
  max-width: 65%;
  padding: 10px 14px;
  border-radius: var(--radius);
  position: relative;
  line-height: 1.5;
  font-size: 15px;
  box-shadow: var(--shadow);
  word-wrap: break-word;
}

.message.human-bubble {
  background: var(--human-bubble);
  border-top-left-radius: 2px;
}
.message.ai-bubble {
  background: var(--ai-bubble);
  border-top-right-radius: 2px;
}
.message.system-bubble {
  background: rgba(255, 255, 255, 0.92);
  width: 80%;
  max-width: 80%;
  font-size: 13px;
  color: var(--text-secondary);
  padding: 10px 16px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
}
.message.tool-bubble {
  background: var(--tool-bg);
  width: 80%;
  max-width: 80%;
  font-size: 14px;
  border-radius: var(--radius);
  max-height: 500px;
  overflow-y: auto;
}

.message-text {
  white-space: pre-wrap;
}

.message-time {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
  text-align: right;
}

.message-label {
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.message-label.human-label { color: var(--pill-human-text); }
.message-label.ai-label { color: var(--badge-text); }
.message-label.tool-label { color: var(--tool-text); }

.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
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
.badge.verified {
  background: var(--badge-verified-bg);
  color: var(--badge-verified-text);
}
.badge.end-conv {
  background: var(--badge-end-bg);
  color: var(--badge-end-text);
}

.system-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 12px;
  text-align: left;
}
.system-grid-label {
  font-weight: 700;
  color: var(--text-primary);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  white-space: nowrap;
}
.system-grid-value {
  color: var(--text-secondary);
  font-size: 12px;
  word-break: break-all;
}

.tool-details {
  margin-top: 4px;
}
.tool-details summary {
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 600;
}
.tool-details summary:hover {
  color: var(--text-primary);
}
.tool-details pre {
  margin-top: 6px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 4px;
  font-size: 12px;
  overflow-x: auto;
  max-height: 300px;
  overflow-y: auto;
}
</style>
