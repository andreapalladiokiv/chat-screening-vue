<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useSessionsStore } from '@/stores/sessions';
import { FILTER_DATE_RANGE_MAX_DAYS, type SessionFilterParams } from '@/api/sessions';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const sessions = useSessionsStore();

// Local form state — committed to the store via Apply.
// Each input is a string (datetime-local / number) so we don't fight v-model.
const dateFrom = ref('');
const dateTo = ref('');
const msgMin = ref('');
const msgMax = ref('');
const sortBy = ref<'newest' | 'oldest' | 'most-msgs' | 'least-msgs'>('newest');
const reviewedFilter = ref<'all' | 'unreviewed' | 'reviewed'>('all');
const validation = ref(''); // '' | 'true' | 'false'
const isWhatsapp = ref('');
const hasLead = ref('');
const hasCase = ref('');
const hasBooking = ref('');

// Date-range validation — mirrors legacy 7-day cap (matches the SQL safety
// net in get_session_list). Warning is shown but Apply is also disabled.
const dateWarning = computed(() => {
  if (!dateFrom.value || !dateTo.value) return null;
  const a = new Date(dateFrom.value).getTime();
  const b = new Date(dateTo.value).getTime();
  if (isNaN(a) || isNaN(b)) return null;
  const days = Math.abs(b - a) / (1000 * 60 * 60 * 24);
  if (days > FILTER_DATE_RANGE_MAX_DAYS) {
    return `Date range must not exceed ${FILTER_DATE_RANGE_MAX_DAYS} days.`;
  }
  return null;
});

function isoOrUndefined(v: string): string | undefined {
  if (!v) return undefined;
  // datetime-local values are "YYYY-MM-DDTHH:MM"
  return v.length > 10 ? `${v}:00` : `${v}T00:00:00`;
}

function intOrUndefined(v: string): number | undefined {
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return isNaN(n) ? undefined : n;
}

function boolOrUndefined(v: string): boolean | undefined {
  if (v === 'true') return true;
  if (v === 'false') return false;
  return undefined;
}

const collected = computed<SessionFilterParams>(() => ({
  dateFrom: isoOrUndefined(dateFrom.value),
  dateTo: isoOrUndefined(dateTo.value),
  msgMin: intOrUndefined(msgMin.value),
  msgMax: intOrUndefined(msgMax.value),
  validation: boolOrUndefined(validation.value),
  isWhatsapp: boolOrUndefined(isWhatsapp.value),
  hasLead: boolOrUndefined(hasLead.value),
  hasCase: boolOrUndefined(hasCase.value),
  hasBooking: boolOrUndefined(hasBooking.value),
}));

const hasAnyFilter = computed(() => {
  const c = collected.value;
  return !!(
    c.dateFrom || c.dateTo ||
    c.msgMin != null || c.msgMax != null ||
    c.validation != null || c.isWhatsapp != null ||
    c.hasLead != null || c.hasCase != null || c.hasBooking != null
  );
});

// Apply is allowed when there's anything to apply (server filter OR a
// sort/reviewed change). Date warning blocks regardless.
const sortOrReviewedChanged = computed(
  () => sortBy.value !== sessions.sortBy || reviewedFilter.value !== sessions.reviewedFilter,
);
const applyDisabled = computed(
  () => (!hasAnyFilter.value && !sortOrReviewedChanged.value) || dateWarning.value !== null,
);

// When the popover opens, hydrate the form from the currently applied
// filters + the active sort/reviewed settings so users see what's active.
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    const f = sessions.appliedFilters;
    dateFrom.value = f?.dateFrom ? f.dateFrom.slice(0, 16) : '';
    dateTo.value = f?.dateTo ? f.dateTo.slice(0, 16) : '';
    msgMin.value = f?.msgMin != null ? String(f.msgMin) : '';
    msgMax.value = f?.msgMax != null ? String(f.msgMax) : '';
    sortBy.value = sessions.sortBy;
    reviewedFilter.value = sessions.reviewedFilter;
    validation.value = f?.validation == null ? '' : String(f.validation);
    isWhatsapp.value = f?.isWhatsapp == null ? '' : String(f.isWhatsapp);
    hasLead.value = f?.hasLead == null ? '' : String(f.hasLead);
    hasCase.value = f?.hasCase == null ? '' : String(f.hasCase);
    hasBooking.value = f?.hasBooking == null ? '' : String(f.hasBooking);
  },
);

async function onApply() {
  if (applyDisabled.value) return;
  // Commit client-side settings first so the visible list re-sorts/filters
  // immediately even before any RPC response.
  sessions.sortBy = sortBy.value;
  sessions.reviewedFilter = reviewedFilter.value;
  if (hasAnyFilter.value) {
    // Server filters present → trigger RPC reload.
    await sessions.applyFilters(collected.value);
  } else if (sessions.filtersApplied) {
    // Sort/reviewed-only Apply while server filters were active → drop them.
    await sessions.clearFilters();
  }
  // Pure sort/reviewed change with no prior server filters → store update
  // alone is enough; `visible` recomputes immediately.
  emit('close');
}

async function onClear() {
  dateFrom.value = '';
  dateTo.value = '';
  msgMin.value = '';
  msgMax.value = '';
  sortBy.value = 'newest';
  reviewedFilter.value = 'all';
  validation.value = '';
  isWhatsapp.value = '';
  hasLead.value = '';
  hasCase.value = '';
  hasBooking.value = '';
  sessions.sortBy = 'newest';
  sessions.reviewedFilter = 'all';
  await sessions.clearFilters();
  emit('close');
}
</script>

<template>
  <div class="filter-popover-overlay" :class="{ open }" @click="emit('close')"></div>
  <div class="filter-popover" :class="{ open }" role="dialog" aria-modal="true" aria-labelledby="filter-title">
    <div class="filter-popover-header">
      <h3 id="filter-title">Filters</h3>
      <button class="filter-popover-close" title="Close" @click="emit('close')">&#10005;</button>
    </div>

    <!-- SESSION -->
    <div class="filter-group">
      <span class="filter-group-label">Session</span>
      <div class="filter-group-fields">
        <div class="filter-cell">
          <label>Date from</label>
          <input v-model="dateFrom" type="datetime-local" />
        </div>
        <div class="filter-cell">
          <label>Date to</label>
          <input v-model="dateTo" type="datetime-local" />
        </div>
        <div class="filter-cell">
          <label>Msg min</label>
          <input v-model="msgMin" type="number" placeholder="min" min="0" />
        </div>
        <div class="filter-cell">
          <label>Msg max</label>
          <input v-model="msgMax" type="number" placeholder="max" min="0" />
        </div>
        <div class="filter-cell">
          <label>Sort by</label>
          <select v-model="sortBy">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="most-msgs">Most messages</option>
            <option value="least-msgs">Fewest messages</option>
          </select>
        </div>
        <div class="filter-cell">
          <label>Reviewed</label>
          <select v-model="reviewedFilter">
            <option value="all">All sessions</option>
            <option value="unreviewed">Unreviewed only</option>
            <option value="reviewed">Reviewed only</option>
          </select>
        </div>
      </div>
    </div>

    <!-- AI RESPONSE -->
    <div class="filter-group">
      <span class="filter-group-label">AI Response</span>
      <div class="filter-group-fields">
        <div class="filter-cell">
          <label>Tools used</label>
          <button class="dd-stub" disabled title="Multi-select dropdowns land in a follow-up M2 sub-milestone">All tools</button>
        </div>
        <div class="filter-cell">
          <label>Category</label>
          <button class="dd-stub" disabled title="Multi-select dropdowns land in a follow-up M2 sub-milestone">All categories</button>
        </div>
        <div class="filter-cell">
          <label>Request type</label>
          <button class="dd-stub" disabled title="Multi-select dropdowns land in a follow-up M2 sub-milestone">All types</button>
        </div>
        <div class="filter-cell">
          <label>Verified</label>
          <select disabled title="Client-side filter — lands with the predicate sub-milestone">
            <option value="">All</option>
          </select>
        </div>
        <div class="filter-cell">
          <label>End conv.</label>
          <select disabled title="Client-side filter — lands with the predicate sub-milestone">
            <option value="">All</option>
          </select>
        </div>
      </div>
    </div>

    <!-- VISITOR -->
    <div class="filter-group">
      <span class="filter-group-label">Visitor</span>
      <div class="filter-group-fields">
        <div class="filter-cell">
          <label>Project</label>
          <button class="dd-stub" disabled title="Multi-select dropdowns land in a follow-up M2 sub-milestone">All projects</button>
        </div>
        <div class="filter-cell">
          <label>Visitor type</label>
          <button class="dd-stub" disabled title="Multi-select dropdowns land in a follow-up M2 sub-milestone">All visitor types</button>
        </div>
        <div class="filter-cell">
          <label>Language</label>
          <button class="dd-stub" disabled title="Multi-select dropdowns land in a follow-up M2 sub-milestone">All languages</button>
        </div>
        <div class="filter-cell">
          <label>WhatsApp</label>
          <select v-model="isWhatsapp">
            <option value="">All</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>
        <div class="filter-cell">
          <label>Validated</label>
          <select v-model="validation">
            <option value="">All</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>
      </div>
    </div>

    <!-- CRM -->
    <div class="filter-group">
      <span class="filter-group-label">CRM</span>
      <div class="filter-group-fields">
        <div class="filter-cell">
          <label>Has lead</label>
          <select v-model="hasLead">
            <option value="">All</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>
        <div class="filter-cell">
          <label>Has case</label>
          <select v-model="hasCase">
            <option value="">All</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>
        <div class="filter-cell">
          <label>Has booking</label>
          <select v-model="hasBooking">
            <option value="">All</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>
      </div>
    </div>

    <div v-if="dateWarning" class="filter-date-warning">{{ dateWarning }}</div>

    <div class="filter-popover-actions">
      <button class="filter-clear-btn" @click="onClear">Clear All</button>
      <button class="filter-apply-btn" :disabled="applyDisabled" @click="onApply">Apply Filters</button>
    </div>
  </div>
</template>

<style scoped>
.filter-popover-overlay {
  display: none;
  position: fixed;
  inset: 0;
  z-index: var(--z-overlay);
}
.filter-popover-overlay.open {
  display: block;
}

.filter-popover {
  display: none;
  position: fixed;
  top: 50px;
  left: 50%;
  transform: translateX(-50%);
  width: 720px;
  max-width: 95vw;
  max-height: calc(100vh - 70px);
  overflow-y: auto;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  z-index: var(--z-modal);
  padding: 20px 24px;
}
.filter-popover.open {
  display: block;
}

.filter-popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.filter-popover-header h3 {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}
.filter-popover-close {
  background: none;
  border: none;
  font-size: 18px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}
.filter-popover-close:hover {
  background: var(--bg);
}

.filter-group {
  margin-bottom: 14px;
}
.filter-group-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
  margin-bottom: 8px;
  display: block;
}
.filter-group-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-end;
}
.filter-group + .filter-group {
  border-top: 1px solid var(--border);
  padding-top: 14px;
}

.filter-cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.filter-cell > label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
}
.filter-cell select,
.filter-cell input[type='date'],
.filter-cell input[type='datetime-local'],
.filter-cell input[type='number'] {
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 12px;
  outline: none;
  background: #fff;
  min-width: 0;
}
.filter-cell input[type='date'],
.filter-cell input[type='datetime-local'] {
  width: 180px;
}
.filter-cell input[type='number'] {
  width: 72px;
}
.filter-cell select {
  min-width: 110px;
}
.filter-cell select:focus,
.filter-cell input:focus {
  border-color: var(--accent);
}
.filter-cell select:disabled,
.filter-cell .dd-stub {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Multi-select stubs — visually a button-like field for parity. */
.dd-stub {
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 12px;
  background: #fff;
  text-align: left;
  min-width: 130px;
  color: var(--text-secondary);
}

.filter-date-warning {
  color: var(--danger);
  font-size: 11px;
  font-weight: 600;
  margin-top: 4px;
}

.filter-popover-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.filter-clear-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 6px 14px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
}
.filter-clear-btn:hover {
  border-color: var(--danger);
  color: var(--danger);
}
.filter-apply-btn {
  padding: 6px 18px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  white-space: nowrap;
}
.filter-apply-btn:hover:not(:disabled) {
  background: var(--accent-hover);
}
.filter-apply-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
