<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { nextDropdownId, setOpenDropdown, getOpenDropdownRef } from '@/state/openDropdown';

/**
 * Compact custom datetime picker — styled to match the rest of the
 * filter popover (same trigger as Multi/Single-Select, panel shadow and
 * radius, no library). v-model is the legacy "YYYY-MM-DDTHH:MM" string
 * so FilterPopover's toRpcParams stays unchanged.
 *
 * Coordinated with src/state/openDropdown — opening this picker closes
 * any other open dropdown, and vice versa.
 */

const props = defineProps<{
  modelValue: string;
  placeholder?: string;
}>();

const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>();

const myId = nextDropdownId();
const openId = getOpenDropdownRef();
const rootRef = ref<HTMLElement | null>(null);

const open = computed(() => openId.value === myId);

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toIso(d: Date, h: number, m: number): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(h)}:${pad(m)}`;
}

/** Parse "YYYY-MM-DDTHH:MM" (or empty) into pieces — null if invalid/empty. */
function parseModel(v: string): { date: Date; h: number; m: number } | null {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return { date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), h: d.getHours(), m: d.getMinutes() };
}

// View state (which month is shown). Hydrated from modelValue when set.
const initial = parseModel(props.modelValue);
const viewYear = ref<number>(initial?.date.getFullYear() ?? new Date().getFullYear());
const viewMonth = ref<number>(initial?.date.getMonth() ?? new Date().getMonth());

// Selected (committed) date + time pieces.
const selDate = ref<Date | null>(initial?.date ?? null);
const selHour = ref<number>(initial?.h ?? 0);
const selMin = ref<number>(initial?.m ?? 0);

const triggerLabel = computed(() => {
  if (!selDate.value) return props.placeholder ?? '';
  return `${selDate.value.getFullYear()}-${pad(selDate.value.getMonth() + 1)}-${pad(
    selDate.value.getDate(),
  )} ${pad(selHour.value)}:${pad(selMin.value)}`;
});

const monthLabel = computed(() => `${MONTH_NAMES[viewMonth.value]} ${viewYear.value}`);

/** 6×7 cell grid for the view month — entries from the previous + next month
 * appear muted; the selected day is highlighted. */
interface DayCell { date: Date; inMonth: boolean; isSelected: boolean }
const grid = computed<DayCell[]>(() => {
  const first = new Date(viewYear.value, viewMonth.value, 1);
  // JS Date.getDay: 0=Sun..6=Sat. Convert to 0=Mon..6=Sun for our header.
  const firstWeekday = (first.getDay() + 6) % 7;
  const start = new Date(viewYear.value, viewMonth.value, 1 - firstWeekday);
  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({
      date: d,
      inMonth: d.getMonth() === viewMonth.value,
      isSelected: !!selDate.value && d.getTime() === selDate.value.getTime(),
    });
  }
  return cells;
});

function toggle(e: Event) {
  e.stopPropagation();
  setOpenDropdown(open.value ? null : myId);
}

function prevMonth() {
  if (viewMonth.value === 0) {
    viewMonth.value = 11;
    viewYear.value -= 1;
  } else {
    viewMonth.value -= 1;
  }
}
function nextMonth() {
  if (viewMonth.value === 11) {
    viewMonth.value = 0;
    viewYear.value += 1;
  } else {
    viewMonth.value += 1;
  }
}

function pickDay(d: Date) {
  selDate.value = d;
  // Stay on the view month containing this date — handy if user clicked a
  // trailing day from the next month.
  viewYear.value = d.getFullYear();
  viewMonth.value = d.getMonth();
  commit();
}

function onHourInput(e: Event) {
  let v = parseInt((e.target as HTMLInputElement).value, 10);
  if (isNaN(v) || v < 0) v = 0;
  if (v > 23) v = 23;
  selHour.value = v;
  commit();
}
function onMinInput(e: Event) {
  let v = parseInt((e.target as HTMLInputElement).value, 10);
  if (isNaN(v) || v < 0) v = 0;
  if (v > 59) v = 59;
  selMin.value = v;
  commit();
}

function commit() {
  if (!selDate.value) {
    emit('update:modelValue', '');
    return;
  }
  emit('update:modelValue', toIso(selDate.value, selHour.value, selMin.value));
}

function setNow() {
  const now = new Date();
  selDate.value = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  selHour.value = now.getHours();
  selMin.value = now.getMinutes();
  viewYear.value = now.getFullYear();
  viewMonth.value = now.getMonth();
  commit();
}
function clearValue() {
  selDate.value = null;
  selHour.value = 0;
  selMin.value = 0;
  emit('update:modelValue', '');
}

function onDocumentClick(e: MouseEvent) {
  if (!open.value) return;
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) {
    setOpenDropdown(null);
  }
}

onMounted(() => document.addEventListener('click', onDocumentClick));
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick);
  if (open.value) setOpenDropdown(null);
});
</script>

<template>
  <div ref="rootRef" class="dd-filter">
    <button class="dd-trigger" :class="{ active: open, empty: !selDate }" type="button" @click="toggle">
      {{ triggerLabel || placeholder || 'Pick date' }}
    </button>
    <div class="dd-panel" :class="{ open }" @click.stop>
      <div class="cal-header">
        <button class="cal-nav" type="button" title="Previous month" @click="prevMonth">‹</button>
        <span class="cal-month">{{ monthLabel }}</span>
        <button class="cal-nav" type="button" title="Next month" @click="nextMonth">›</button>
      </div>
      <div class="cal-weekrow">
        <span v-for="d in WEEKDAYS" :key="d" class="cal-weekday">{{ d }}</span>
      </div>
      <div class="cal-grid">
        <button
          v-for="(c, i) in grid"
          :key="i"
          type="button"
          class="cal-day"
          :class="{ outside: !c.inMonth, selected: c.isSelected }"
          @click="pickDay(c.date)"
        >
          {{ c.date.getDate() }}
        </button>
      </div>
      <div class="cal-time">
        <input
          type="number"
          min="0"
          max="23"
          :value="pad(selHour)"
          @input="onHourInput"
          aria-label="Hour"
        />
        <span class="cal-colon">:</span>
        <input
          type="number"
          min="0"
          max="59"
          :value="pad(selMin)"
          @input="onMinInput"
          aria-label="Minute"
        />
        <button class="cal-action" type="button" @click="setNow">Now</button>
        <button class="cal-action" type="button" @click="clearValue">Clear</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dd-filter {
  position: relative;
  width: 100%;
  min-width: 10rem;
}

.dd-trigger {
  width: 100%;
  text-align: left;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 0.75rem;
  color: var(--text-primary);
  outline: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%23556064'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.5rem center;
  padding-right: 1.5rem;
}
.dd-trigger.empty {
  color: var(--text-secondary);
}
.dd-trigger:hover,
.dd-trigger.active {
  border-color: var(--accent);
}

.dd-panel {
  display: none;
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  width: 14rem;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 4px;
  z-index: var(--z-dropdown);
  box-shadow: var(--shadow-md);
  padding: 0.5rem;
}
.dd-panel.open {
  display: block;
}

.cal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.375rem;
}
.cal-month {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-primary);
}
.cal-nav {
  background: none;
  border: 1px solid var(--border);
  border-radius: 4px;
  width: 1.375rem;
  height: 1.375rem;
  font-size: 0.875rem;
  line-height: 1;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
}
.cal-nav:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.cal-weekrow,
.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
}
.cal-weekday {
  font-size: 0.625rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-align: center;
  padding: 2px 0;
}
.cal-day {
  background: none;
  border: none;
  font-size: 0.6875rem;
  color: var(--text-primary);
  padding: 0.25rem 0;
  cursor: pointer;
  border-radius: 3px;
  text-align: center;
  line-height: 1;
}
.cal-day:hover {
  background: var(--bg);
}
.cal-day.outside {
  color: var(--text-secondary);
  opacity: 0.4;
}
.cal-day.selected {
  background: var(--accent);
  color: #fff;
  font-weight: 600;
}

.cal-time {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border);
}
.cal-time input[type='number'] {
  width: 2.375rem;
  padding: 3px 0.25rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 0.75rem;
  text-align: center;
  outline: none;
  -moz-appearance: textfield;
}
.cal-time input[type='number']::-webkit-outer-spin-button,
.cal-time input[type='number']::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.cal-time input:focus {
  border-color: var(--accent);
}
.cal-colon {
  color: var(--text-secondary);
  font-weight: 600;
}
.cal-action {
  margin-left: auto;
  background: none;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px 0.375rem;
  font-size: 0.625rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
}
.cal-action:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.cal-action + .cal-action {
  margin-left: 0.25rem;
}
</style>
