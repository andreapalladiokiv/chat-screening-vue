<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { nextDropdownId, setOpenDropdown, getOpenDropdownRef } from '@/state/openDropdown';

const props = defineProps<{
  /** v-model: array of selected values. */
  modelValue: string[];
  /** Available options. Strings; rendered as-is. */
  options: string[];
  /** Label shown on trigger when nothing is selected, e.g. "All tools". */
  defaultLabel: string;
  /** Prefix shown when 1+ selected, e.g. "Tools (3)". */
  activePrefix: string;
}>();

const emit = defineEmits<{ (e: 'update:modelValue', value: string[]): void }>();

const myId = nextDropdownId();
const openId = getOpenDropdownRef();
const rootRef = ref<HTMLElement | null>(null);

const open = computed(() => openId.value === myId);

const triggerLabel = computed(() => {
  if (props.modelValue.length === 0) return props.defaultLabel;
  return `${props.activePrefix} (${props.modelValue.length})`;
});

function toggle(e: Event) {
  e.stopPropagation();
  setOpenDropdown(open.value ? null : myId);
}

function isChecked(item: string): boolean {
  return props.modelValue.includes(item);
}

function onToggleItem(item: string) {
  const next = isChecked(item)
    ? props.modelValue.filter((v) => v !== item)
    : [...props.modelValue, item];
  emit('update:modelValue', next);
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
    <button class="dd-trigger" :class="{ active: open }" type="button" @click="toggle">
      {{ triggerLabel }}
    </button>
    <div class="dd-panel" :class="{ open }">
      <label v-if="options.length === 0" class="dd-empty">(no options)</label>
      <label v-for="item in options" :key="item">
        <input
          type="checkbox"
          :checked="isChecked(item)"
          @change="onToggleItem(item)"
        />
        <span>{{ item }}</span>
      </label>
    </div>
  </div>
</template>

<style scoped>
/* Class names match legacy; baseline picks the .filter-popover overrides
 * (padding 6px 8px, min-width 130px) since this dropdown is currently
 * only used inside the filter popover. */
.dd-filter {
  position: relative;
  width: 100%;
  min-width: 8.125rem;
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
  overflow: visible;
  text-overflow: clip;
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
  min-width: 100%;
  max-height: 10rem;
  overflow-y: auto;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 4px;
  z-index: var(--z-dropdown);
  box-shadow: var(--shadow-md);
}
.dd-panel.open {
  display: block;
}

.dd-panel label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3125rem 0.625rem;
  cursor: pointer;
  font-size: 0.75rem;
  color: var(--text-primary);
  white-space: nowrap;
  min-width: auto;
}
.dd-panel label:hover {
  background: var(--bg);
}
.dd-panel input[type='checkbox'] {
  margin: 0;
  accent-color: var(--accent);
  cursor: pointer;
}

.dd-empty {
  color: var(--text-secondary);
  font-style: italic;
  cursor: default;
}
.dd-empty:hover {
  background: transparent;
}
</style>
