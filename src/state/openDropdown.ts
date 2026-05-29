import { ref } from 'vue';

/**
 * Shared "currently open dropdown id" — module-level singleton so only one
 * MultiSelectDropdown is open at a time across the whole app. Each instance
 * registers a unique id on mount and writes its id when opened; others see
 * openId !== mine and close themselves.
 */
const openId = ref<string | null>(null);
let counter = 0;

export function nextDropdownId(): string {
  counter += 1;
  return `dd-${counter}`;
}

export function setOpenDropdown(id: string | null): void {
  openId.value = id;
}

export function getOpenDropdownRef() {
  return openId;
}
