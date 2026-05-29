<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useFeedbackStore } from '@/stores/feedback';
import { formatTime } from '@/utils/formatDate';
import SingleSelectDropdown from '@/components/SingleSelectDropdown.vue';

const auth = useAuthStore();
const feedback = useFeedbackStore();

const category = ref('');
const comment = ref('');

const categoryOptions = [
  { value: '', label: 'Select a category...' },
  { value: 'bug', label: 'Bug / Incorrect response' },
  { value: 'suggestion', label: 'Suggestion / Improvement' },
  { value: 'praise', label: 'Praise / Good response' },
  { value: 'other', label: 'Other' },
];

const subtitle = computed(() => {
  const m = feedback.meta;
  if (!m) return '';
  if (m.type === 'chat') {
    return `About chat session: ${(m.session_id ?? '').substring(0, 24)}…`;
  }
  // Legacy formats the timestamp via formatTime — "Nov 5, 14:30:45 PM".
  const when = m.message_timestamp ? ` at ${formatTime(m.message_timestamp)}` : '';
  return `About ${m.message_type ?? 'message'} message${when}`;
});

const submitDisabled = computed(
  () => feedback.submitting || !category.value || !comment.value.trim(),
);

const userLabel = computed(() => auth.displayName);
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

      <label>Category</label>
      <div class="fb-category">
        <SingleSelectDropdown v-model="category" :options="categoryOptions" />
      </div>

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
  width: 27.5rem;
  max-width: 92vw;
  max-height: 90vh;
  overflow-y: auto;
  padding: 1.75rem;
}

.feedback-modal h3 {
  font-size: 1.125rem;
  margin-bottom: 0.25rem;
}
.fb-subtitle {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-bottom: 1.125rem;
}
.fb-user {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
}

.feedback-modal label {
  display: block;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 0.25rem;
}
.fb-category {
  /* Same vertical rhythm as the textarea — gives the SingleSelectDropdown
   * the same gap to the next label that the textarea has. */
  margin-bottom: 0.875rem;
}

/* Scale the dropdown trigger up to match the modal's larger inputs
 * (textarea is 14px / 8-10 padding). The component's base size targets
 * the denser filter popover. */
.fb-category :deep(.dd-trigger) {
  padding: 0.5rem 0.625rem;
  padding-right: 1.75rem;
  font-size: 0.875rem;
}
.fb-category :deep(.dd-item) {
  padding: 0.4375rem 0.75rem;
  font-size: 0.875rem;
}

.feedback-modal textarea {
  width: 100%;
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 0.875rem;
  font-family: inherit;
  outline: none;
  margin-bottom: 0.875rem;
  resize: vertical;
  min-height: 5.625rem;
}
.feedback-modal textarea:focus {
  border-color: var(--accent);
}

.fb-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}
.fb-actions button {
  padding: 0.5rem 1.125rem;
  border-radius: var(--radius);
  font-size: 0.875rem;
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
  font-size: 0.75rem;
  margin-top: 0.5rem;
  min-height: 1rem;
}
.fb-status.error {
  color: var(--danger);
}
.fb-status.success {
  color: var(--accent);
}
</style>
