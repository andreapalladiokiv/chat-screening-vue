<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useSessionsStore } from '@/stores/sessions';
import { FILTER_DATE_RANGE_MAX_DAYS, type SessionFilterParams } from '@/api/sessions';
import MultiSelectDropdown from '@/components/MultiSelectDropdown.vue';
import SingleSelectDropdown from '@/components/SingleSelectDropdown.vue';
import DateTimeField from '@/components/DateTimeField.vue';

const yesNoOptions = [
  { value: '', label: 'All' },
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];
const sortOptions = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'most-msgs', label: 'Most messages' },
  { value: 'least-msgs', label: 'Fewest messages' },
];
const reviewedOptions = [
  { value: 'all', label: 'All sessions' },
  { value: 'unreviewed', label: 'Unreviewed only' },
  { value: 'reviewed', label: 'Reviewed only' },
];

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const sessions = useSessionsStore();

// Local form state — committed to the store via Apply.
const dateFrom = ref('');
const dateTo = ref('');
const msgMin = ref('');
const msgMax = ref('');
const sortBy = ref<'newest' | 'oldest' | 'most-msgs' | 'least-msgs'>('newest');
const reviewedFilter = ref<'all' | 'unreviewed' | 'reviewed'>('all');
const tools = ref<string[]>([]);
const categories = ref<string[]>([]);
const requestTypes = ref<string[]>([]);
const projects = ref<string[]>([]);
const visitorTypes = ref<string[]>([]);
const languages = ref<string[]>([]);
const verifiedFilter = ref<'' | 'true' | 'false'>('');
const endConvFilter = ref<'' | 'true' | 'false'>('');
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
  tools: tools.value.length ? tools.value : undefined,
  categories: categories.value.length ? categories.value : undefined,
  requestTypes: requestTypes.value.length ? requestTypes.value : undefined,
  projects: projects.value.length ? projects.value : undefined,
  visitorTypes: visitorTypes.value.length ? visitorTypes.value : undefined,
  languages: languages.value.length ? languages.value : undefined,
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
    c.tools?.length || c.categories?.length || c.requestTypes?.length ||
    c.projects?.length || c.visitorTypes?.length || c.languages?.length ||
    c.validation != null || c.isWhatsapp != null ||
    c.hasLead != null || c.hasCase != null || c.hasBooking != null
  );
});

// Apply is allowed when there's anything to apply (server filter OR a
// client-side change). Date warning blocks regardless.
const clientSideChanged = computed(
  () =>
    sortBy.value !== sessions.sortBy ||
    reviewedFilter.value !== sessions.reviewedFilter ||
    verifiedFilter.value !== sessions.verifiedFilter ||
    endConvFilter.value !== sessions.endConvFilter,
);
const applyDisabled = computed(
  () => (!hasAnyFilter.value && !clientSideChanged.value) || dateWarning.value !== null,
);

// When the popover opens, hydrate the form from currently applied filters
// + the active client-side settings so users see what's active.
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    const f = sessions.appliedFilters;
    dateFrom.value = f?.dateFrom ? f.dateFrom.slice(0, 16) : '';
    dateTo.value = f?.dateTo ? f.dateTo.slice(0, 16) : '';
    msgMin.value = f?.msgMin != null ? String(f.msgMin) : '';
    msgMax.value = f?.msgMax != null ? String(f.msgMax) : '';
    tools.value = f?.tools ? [...f.tools] : [];
    categories.value = f?.categories ? [...f.categories] : [];
    requestTypes.value = f?.requestTypes ? [...f.requestTypes] : [];
    projects.value = f?.projects ? [...f.projects] : [];
    visitorTypes.value = f?.visitorTypes ? [...f.visitorTypes] : [];
    languages.value = f?.languages ? [...f.languages] : [];
    sortBy.value = sessions.sortBy;
    reviewedFilter.value = sessions.reviewedFilter;
    verifiedFilter.value = sessions.verifiedFilter;
    endConvFilter.value = sessions.endConvFilter;
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
  sessions.verifiedFilter = verifiedFilter.value;
  sessions.endConvFilter = endConvFilter.value;
  if (hasAnyFilter.value) {
    await sessions.applyFilters(collected.value);
  } else if (sessions.filtersApplied) {
    // Client-side-only Apply while server filters were active → drop them.
    await sessions.clearFilters();
  }
  emit('close');
}

async function onClear() {
  dateFrom.value = '';
  dateTo.value = '';
  msgMin.value = '';
  msgMax.value = '';
  tools.value = [];
  categories.value = [];
  requestTypes.value = [];
  projects.value = [];
  visitorTypes.value = [];
  languages.value = [];
  sortBy.value = 'newest';
  reviewedFilter.value = 'all';
  verifiedFilter.value = '';
  endConvFilter.value = '';
  validation.value = '';
  isWhatsapp.value = '';
  hasLead.value = '';
  hasCase.value = '';
  hasBooking.value = '';
  sessions.sortBy = 'newest';
  sessions.reviewedFilter = 'all';
  sessions.verifiedFilter = '';
  sessions.endConvFilter = '';
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
        <div class="filter-cell filter-cell-date">
          <label>Date from</label>
          <DateTimeField v-model="dateFrom" placeholder="yyyy-mm-dd hh:mm" />
        </div>
        <div class="filter-cell filter-cell-date">
          <label>Date to</label>
          <DateTimeField v-model="dateTo" placeholder="yyyy-mm-dd hh:mm" />
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
          <SingleSelectDropdown v-model="sortBy" :options="sortOptions" />
        </div>
        <div class="filter-cell">
          <label>Reviewed</label>
          <SingleSelectDropdown v-model="reviewedFilter" :options="reviewedOptions" />
        </div>
      </div>
    </div>

    <!-- AI RESPONSE -->
    <div class="filter-group">
      <span class="filter-group-label">AI Response</span>
      <div class="filter-group-fields">
        <div class="filter-cell">
          <label>Tools used</label>
          <MultiSelectDropdown
            v-model="tools"
            :options="sessions.filterOptions.tools"
            default-label="All tools"
            active-prefix="Tools"
          />
        </div>
        <div class="filter-cell">
          <label>Category</label>
          <MultiSelectDropdown
            v-model="categories"
            :options="sessions.filterOptions.categories"
            default-label="All categories"
            active-prefix="Category"
          />
        </div>
        <div class="filter-cell">
          <label>Request type</label>
          <MultiSelectDropdown
            v-model="requestTypes"
            :options="sessions.filterOptions.request_types"
            default-label="All types"
            active-prefix="Type"
          />
        </div>
        <div class="filter-cell">
          <label>Verified</label>
          <SingleSelectDropdown v-model="verifiedFilter" :options="yesNoOptions" />
        </div>
        <div class="filter-cell">
          <label>End conv.</label>
          <SingleSelectDropdown v-model="endConvFilter" :options="yesNoOptions" />
        </div>
      </div>
    </div>

    <!-- VISITOR -->
    <div class="filter-group">
      <span class="filter-group-label">Visitor</span>
      <div class="filter-group-fields">
        <div class="filter-cell">
          <label>Project</label>
          <MultiSelectDropdown
            v-model="projects"
            :options="sessions.filterOptions.projects"
            default-label="All projects"
            active-prefix="Project"
          />
        </div>
        <div class="filter-cell">
          <label>Visitor type</label>
          <MultiSelectDropdown
            v-model="visitorTypes"
            :options="sessions.filterOptions.visitor_types"
            default-label="All visitor types"
            active-prefix="Visitor type"
          />
        </div>
        <div class="filter-cell">
          <label>Language</label>
          <MultiSelectDropdown
            v-model="languages"
            :options="sessions.filterOptions.languages"
            default-label="All languages"
            active-prefix="Language"
          />
        </div>
        <div class="filter-cell">
          <label>WhatsApp</label>
          <SingleSelectDropdown v-model="isWhatsapp" :options="yesNoOptions" />
        </div>
        <div class="filter-cell">
          <label>Validated</label>
          <SingleSelectDropdown v-model="validation" :options="yesNoOptions" />
        </div>
      </div>
    </div>

    <!-- CRM -->
    <div class="filter-group">
      <span class="filter-group-label">CRM</span>
      <div class="filter-group-fields">
        <div class="filter-cell">
          <label>Has lead</label>
          <SingleSelectDropdown v-model="hasLead" :options="yesNoOptions" />
        </div>
        <div class="filter-cell">
          <label>Has case</label>
          <SingleSelectDropdown v-model="hasCase" :options="yesNoOptions" />
        </div>
        <div class="filter-cell">
          <label>Has booking</label>
          <SingleSelectDropdown v-model="hasBooking" :options="yesNoOptions" />
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
  border-radius: 4px;
  font-size: 12px;
  outline: none;
  background: #fff;
  color: var(--text-primary);
  min-width: 0;
}
.filter-cell input[type='number'] {
  width: 72px;
}
.filter-cell-date {
  width: 190px;
  min-width: 190px;
}
/* Match MultiSelectDropdown shape: native chevron replaced with the same
 * SVG arrow so all six "boolean / multi" selectors render visually
 * uniform across the popover. */
.filter-cell select {
  min-width: 110px;
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%23556064'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  padding-right: 24px;
}
.filter-cell select:focus,
.filter-cell input:focus {
  border-color: var(--accent);
}
.filter-cell select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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
