<script setup lang="ts">
import { computed } from 'vue';
import { useSessionsStore } from '@/stores/sessions';
import { useMessagesStore } from '@/stores/messages';
import { useFeedbackStore } from '@/stores/feedback';
import { formatDuration } from '@/utils/formatDuration';
import { lastAiClassification } from '@/utils/sessionClassification';
import { buildTypePills } from '@/utils/typePills';
import { hasEnrichment } from '@/utils/sessionEnrichment';
import InSessionSearch from '@/components/InSessionSearch.vue';

const sessions = useSessionsStore();
const messages = useMessagesStore();
const feedback = useFeedbackStore();

const session = computed(() => sessions.current);

const isReviewed = computed(() =>
  session.value ? sessions.reviewedIds.has(session.value.id) : false,
);

// Pipeline derives from messages.parsed — when no messages loaded yet,
// duration and classification gracefully default to empty / null.
const duration = computed(() => {
  const rows = messages.rows;
  if (rows.length < 2) return rows.length === 1 ? '0s' : '';
  const first = new Date(rows[0].created_at).getTime();
  const last = new Date(rows[rows.length - 1].created_at).getTime();
  return formatDuration(last - first);
});

const classification = computed(() => lastAiClassification(messages.parsed));

const typePills = computed(() =>
  buildTypePills(session.value?.typeCounts ?? { human: 0, ai: 0, tool: 0, system: 0 }),
);

const tools = computed(() => session.value?.tools ?? []);

const hasVisitorEnrichment = computed(() => hasEnrichment(session.value));

function onReviewedToggle() {
  if (session.value) sessions.toggleReviewed(session.value.id);
}

function onOpenFeedback() {
  if (!session.value) return;
  feedback.openChatFeedback(session.value.id, session.value.count);
}

function onExpandToggle() {
  messages.allToolDetailsOpen = !messages.allToolDetailsOpen;
}

function onJump(target: 'first-ai' | 'first-tool' | 'last') {
  messages.requestJump(target);
}

</script>

<template>
  <aside v-if="session" class="detail-sidebar active">
    <!-- Actions: Mark Reviewed / Feedback / Expand All -->
    <div class="detail-sidebar-section detail-sidebar-actions">
      <button
        class="chat-reviewed-btn"
        :class="{ 'reviewed-active': isReviewed }"
        @click="onReviewedToggle"
      >
        {{ isReviewed ? 'Reviewed ✓' : 'Mark Reviewed' }}
      </button>
      <button class="chat-feedback-btn" @click="onOpenFeedback">Feedback</button>
      <button
        class="tool-toggle-btn"
        :title="messages.allToolDetailsOpen ? 'Collapse all tool details' : 'Expand all tool details'"
        @click="onExpandToggle"
      >
        {{ messages.allToolDetailsOpen ? 'Collapse All' : 'Expand All' }}
      </button>
    </div>

    <!-- In-session search -->
    <div class="detail-sidebar-section detail-sidebar-search">
      <InSessionSearch />
    </div>

    <!-- Quick Jump -->
    <div class="detail-sidebar-section">
      <span class="detail-sidebar-label">Quick Jump</span>
      <div class="summary-jump-btns">
        <button class="summary-jump-btn" @click="onJump('first-ai')">First AI</button>
        <button class="summary-jump-btn" @click="onJump('first-tool')">First Tool</button>
        <button class="summary-jump-btn" @click="onJump('last')">Last</button>
      </div>
    </div>

    <!-- Duration -->
    <div v-if="duration" class="detail-sidebar-section">
      <span class="detail-sidebar-label">Duration</span>
      <span class="summary-duration">{{ duration }}</span>
    </div>

    <!-- Messages (type pills) -->
    <div class="detail-sidebar-section">
      <span class="detail-sidebar-label">Messages</span>
      <div class="type-counts">
        <span v-for="p in typePills" :key="p.kind" class="type-pill" :class="p.kind">
          {{ p.n }} {{ p.label }}
        </span>
      </div>
    </div>

    <!-- Result (classification from last AI final) -->
    <div v-if="classification" class="detail-sidebar-section">
      <span class="detail-sidebar-label">Result</span>
      <div class="badges">
        <span v-if="classification.requestCategory" class="badge">{{ classification.requestCategory }}</span>
        <span v-if="classification.requestType" class="badge">{{ classification.requestType }}</span>
        <span v-if="classification.identityVerified" class="badge verified">verified</span>
        <span v-if="classification.endConversation" class="badge end-conv">end</span>
      </div>
    </div>

    <!-- Tools Used -->
    <div class="detail-sidebar-section">
      <span class="detail-sidebar-label">Tools Used</span>
      <div v-if="tools.length" class="summary-tools">
        <span v-for="t in tools" :key="t" class="summary-tool-tag">{{ t }}</span>
      </div>
      <span v-else class="empty-line">none</span>
    </div>

    <!-- Visitor -->
    <div class="detail-sidebar-section">
      <span class="detail-sidebar-label">Visitor</span>
      <div v-if="hasVisitorEnrichment" class="chat-header-visitor">
        <span v-if="session.project" class="badge badge-project">{{ session.project }}</span>
        <span v-if="session.visitorType" class="badge badge-visitor-type">{{ session.visitorType }}</span>
        <span v-if="session.language" class="badge badge-language">{{ session.language }}</span>
        <span v-if="session.isWhatsapp" class="badge badge-whatsapp">WhatsApp</span>
        <span v-if="session.validation" class="badge badge-validated">validated</span>
        <span v-if="session.hasLead" class="badge badge-entity">lead</span>
        <span v-if="session.hasCase" class="badge badge-entity">case</span>
        <span v-if="session.hasBooking" class="badge badge-entity">booking</span>
      </div>
      <span v-else class="badge badge-no-visitor">no visitor data</span>
    </div>

  </aside>
</template>

<style scoped>
.detail-sidebar {
  width: 20rem;
  min-width: 16.25rem;
  flex-shrink: 0;
  background: var(--sidebar-bg);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.detail-sidebar-section {
  padding: 0.75rem 0.875rem;
  border-bottom: 1px solid var(--border);
}
.detail-sidebar-section:last-child {
  border-bottom: none;
}

.detail-sidebar-label {
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
  margin-bottom: 0.375rem;
  display: block;
}

/* ── Actions row ────────────────────────────────────────────────────── */
.detail-sidebar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}
.chat-reviewed-btn,
.chat-feedback-btn,
.tool-toggle-btn {
  flex: 1 1 auto;
  text-align: center;
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.375rem 0.5rem;
  font-size: 0.75rem;
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
}
.chat-reviewed-btn:hover:not(:disabled) {
  border-color: var(--badge-reviewed-text);
}
.chat-feedback-btn:hover:not(:disabled),
.tool-toggle-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.chat-reviewed-btn.reviewed-active {
  background: var(--badge-reviewed-bg);
  border-color: var(--badge-reviewed-text);
  color: var(--badge-reviewed-text);
  font-weight: 600;
}
.chat-feedback-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* ── In-session search ──────────────────────────────────────────────── */
.detail-sidebar-search {
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
}

/* ── Quick-jump buttons ─────────────────────────────────────────────── */
.summary-jump-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.summary-jump-btn {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 3px 0.5rem;
  font-size: 0.625rem;
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
  font-weight: 600;
}
.summary-jump-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

/* ── Duration ───────────────────────────────────────────────────────── */
.summary-duration {
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-weight: 600;
  background: var(--bg);
  padding: 2px 0.5rem;
  border-radius: var(--radius-sm);
  display: inline-block;
}

/* ── Type pills ─────────────────────────────────────────────────────── */
.type-counts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0;
}
.type-pill {
  display: inline-block;
  font-size: 0.625rem;
  font-weight: 600;
  padding: 1px 0.375rem;
  border-radius: 10px;
}
.type-pill.human { background: var(--pill-human-bg); color: var(--pill-human-text); }
.type-pill.ai { background: var(--badge-bg); color: var(--badge-text); }
.type-pill.tool { background: var(--tool-bg); color: var(--tool-text); }
.type-pill.system { background: var(--bg); color: var(--text-secondary); }

/* ── Result / Visitor badges ────────────────────────────────────────── */
.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0;
}
.badge {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 500;
  padding: 2px 0.5rem;
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
.badge.badge-project {
  background: var(--badge-project-bg);
  color: var(--badge-project-text);
}
.badge.badge-visitor-type {
  background: var(--badge-visitor-bg);
  color: var(--badge-visitor-text);
}
.badge.badge-language {
  background: var(--badge-language-bg);
  color: var(--badge-language-text);
}
.badge.badge-whatsapp,
.badge.badge-validated {
  background: var(--badge-whatsapp-bg);
  color: var(--badge-whatsapp-text);
}
.badge.badge-entity {
  background: var(--badge-entity-bg);
  color: var(--badge-entity-text);
}
.badge.badge-no-visitor {
  background: transparent;
  color: var(--text-secondary);
  border: 1px dashed var(--border);
  font-style: italic;
}

.chat-header-visitor {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

/* ── Tools used ─────────────────────────────────────────────────────── */
.summary-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.summary-tool-tag {
  font-size: 0.6875rem;
  padding: 2px 0.5rem;
  border-radius: var(--radius-full);
  background: var(--tool-bg);
  color: var(--tool-text);
  font-weight: 600;
}
.empty-line {
  color: var(--text-secondary);
  font-size: 0.75rem;
}

</style>
