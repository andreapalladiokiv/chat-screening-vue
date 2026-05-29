import { ref } from 'vue';
import { StorageKeys } from '@/constants/storage';

const STORAGE_KEY = StorageKeys.timezone;

/** Tiny shared state for the active timezone — exported as a ref so
 * components that consume it via formatDate inside a computed will
 * re-evaluate on change. */

function loadFromStorage(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? defaultTimezone();
  } catch {
    return defaultTimezone();
  }
}

function defaultTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export const currentTimezone = ref<string>(loadFromStorage());

export function setTimezone(tz: string): void {
  currentTimezone.value = tz;
  try {
    localStorage.setItem(STORAGE_KEY, tz);
  } catch {
    // localStorage unavailable; non-fatal — tz still applies for this session.
  }
}
