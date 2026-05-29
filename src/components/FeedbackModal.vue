<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useFeedbackStore } from '@/stores/feedback';

const auth = useAuthStore();
const feedback = useFeedbackStore();

const category = ref('');
const comment = ref('');

const subtitle = computed(() => {
  const m = feedback.meta;
  if (!m) return '';
  if (m.type === 'chat') {
    return `About chat session: ${(m.session_id ?? '').substring(0, 24)}…`;
  }
  return `About ${m.message_type ?? 'message'}${
    m.message_timestamp ? ` at ${m.message_timestamp}` : ''
  }`;
});

const submitDisabled = computed(
  () => feedback.submitting || !category.value || !comment.value.trim(),
);

const userLabel = computed(() => auth.user?.email ?? 'Unknown');
const envName = computed(() => auth.selectedEnv?.name ?? 'Default');

// Reset form when modal opens.
watch(
  () => feedback.open,
  (open) => {
    if (open) {
      category.value = '';
      comment.value = '';
    }
  },
);

// Auto-close on success after a short pause (matches legacy 1.5s delay).
watch(
  () => feedback.status,
  (s) => {
    if (s === 'success') {
      setTimeout(() => feedback.close(), 1500);
    }
  },
);

function onOverlayClick(e: MouseEvent) {
  // Close only when clicking the dimmed backdrop, not the inner card.
  if (e.target === e.currentTarget) feedback.close();
}

async function onSubmit() {
  if (submitDisabled.value) return;
  await feedback.submit({
    category: category.value,
    comment: comment.value.trim(),
    env: envName.value,
    submittedBy: auth.user?.email ?? null,
  });
}
</script>

<template>
  <div
    class="feedback-overlay"
    :class="{ open: feedback.open }"
    role="dialog"
    aria-modal="true"
    aria-labelledby="fb-modal-title"
    @click="onOverlayClick"
  >
    <div class="feedback-modal">
      <h3 id="fb-modal-title">Leave Feedback</h3>
      <div class="fb-subtitle">{{ subtitle }}</div>
      <div class="fb-user">Submitted by: <strong>{{ userLabel }}</strong></div>

      <label for="fb-category">Category</label>
      <select id="fb-category" v-model="category">
        <option value="">Select a category...</option>
        <option value="bug">Bug / Incorrect response</option>
        <option value="suggestion">Suggestion / Improvement</option>
        <option value="praise">Praise / Good response</option>
        <option value="other">Other</option>
      </select>

      <label for="fb-comment">Comment</label>
      <textarea id="fb-comment" v-model="comment" placeholder="Describe your feedback..."></textarea>

      <div class="fb-actions">
        <button class="fb-cancel-btn" @click="feedback.close">Cancel</button>
        <button class="fb-submit-btn" :disabled="submitDisabled" @click="onSubmit">
          {{ feedback.submitting ? 'Submitting…' : 'Submit' }}
        </button>
      </div>

      <div class="fb-status" :class="feedback.status">{{ feedback.message }}</div>
    </div>
  </div>
</template>

<style scoped>
.feedback-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: var(--z-modal);
  align-items: center;
  justify-content: center;
}
.feedback-overlay.open {
  display: flex;
}

.feedback-modal {
  background: #fff;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  width: 440px;
  max-width: 92vw;
  max-height: 90vh;
  overflow-y: auto;
  padding: 28px;
}

.feedback-modal h3 {
  font-size: 18px;
  margin-bottom: 4px;
}
.fb-subtitle {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.fb-user {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.feedback-modal label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.feedback-modal select,
.feedback-modal textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 14px;
  font-family: inherit;
  outline: none;
  margin-bottom: 14px;
}
.feedback-modal select:focus,
.feedback-modal textarea:focus {
  border-color: var(--accent);
}
.feedback-modal textarea {
  resize: vertical;
  min-height: 90px;
}

.fb-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.fb-actions button {
  padding: 8px 18px;
  border-radius: var(--radius);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: none;
}
.fb-cancel-btn {
  background: var(--bg);
  color: var(--text-primary);
}
.fb-cancel-btn:hover {
  background: var(--border);
}
.fb-submit-btn {
  background: var(--accent);
  color: #fff;
}
.fb-submit-btn:hover:not(:disabled) {
  background: var(--accent-hover);
}
.fb-submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.fb-status {
  font-size: 12px;
  margin-top: 8px;
  min-height: 16px;
}
.fb-status.error {
  color: var(--danger);
}
.fb-status.success {
  color: var(--accent);
}
</style>
