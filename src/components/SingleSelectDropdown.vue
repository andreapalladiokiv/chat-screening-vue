<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { nextDropdownId, setOpenDropdown, getOpenDropdownRef } from '@/state/openDropdown';

export interface SingleSelectOption {
  value: string;
  label: string;
}

const props = defineProps<{
  /** v-model: currently selected option value. */
  modelValue: string;
  /** Available options. */
  options: SingleSelectOption[];
}>();

const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>();

const myId = nextDropdownId();
const openId = getOpenDropdownRef();
const rootRef = ref<HTMLElement | null>(null);

const open = computed(() => openId.value === myId);

const triggerLabel = computed(() => {
  const found = props.options.find((o) => o.value === props.modelValue);
  return found?.label ?? props.options[0]?.label ?? '';
});

function toggle(e: Event) {
  e.stopPropagation();
  setOpenDropdown(open.value ? null : myId);
}

function onPick(v: string) {
  emit('update:modelValue', v);
  setOpenDropdown(null);
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
      <button
        v-for="o in options"
        :key="o.value"
        type="button"
        class="dd-item"
        :class="{ selected: o.value === modelValue }"
        @click="onPick(o.value)"
      >
        {{ o.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.dd-filter {
  position: relative;
  width: 100%;
  min-width: 6.875rem;
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
  /* Same chevron as the styled native <select> so the popover row is
   * visually uniform. */
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%23556064'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.5rem center;
  padding-right: 1.5rem;
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

.dd-item {
  display: block;
  width: 100%;
  padding: 0.3125rem 0.625rem;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.75rem;
  color: var(--text-primary);
  text-align: left;
  white-space: nowrap;
}
.dd-item:hover {
  background: var(--bg);
}
.dd-item.selected {
  font-weight: 600;
  color: var(--accent);
}
</style>
