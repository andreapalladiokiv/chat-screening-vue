<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useSessionsStore } from '@/stores/sessions';
import BurgerMenu from '@/components/BurgerMenu.vue';
import { currentTimezone, setTimezone } from '@/state/timezone';

defineEmits<{ (e: 'open-filters'): void }>();

const auth = useAuthStore();
const sessions = useSessionsStore();

const showEnvSwitcher = computed(() => auth.environments.length >= 1);
const singleEnv = computed(() => auth.environments.length <= 1);

// Reactive — flips when setTimezone() is called from onTzClick.
const tzLabel = computed(() => currentTimezone.value);

async function onEnvChange(e: Event) {
  const idx = parseInt((e.target as HTMLSelectElement).value, 10);
  if (idx === auth.selectedEnvIdx) return;
  await auth.switchEnv(idx);
}

async function onRefresh() {
  await sessions.loadDefault();
}

function onSearchInput(e: Event) {
  sessions.setSearchQuery((e.target as HTMLInputElement).value);
}

function onTzClick() {
  // Legacy uses window.prompt; the proper dropdown lands in M3 per review §3.2.3.
  const next = window.prompt(
    'Enter timezone (IANA, e.g. Europe/Chisinau, America/New_York, UTC):',
    currentTimezone.value,
  );
  if (next === null) return; // cancelled
  const trimmed = next.trim();
  if (!trimmed) return;
  // Validate via Intl — invalid IANA strings throw.
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed });
  } catch {
    window.alert(`"${trimmed}" is not a valid IANA timezone. No change applied.`);
    return;
  }
  setTimezone(trimmed);
}
</script>

<template>
  <div class="top-nav">
    <div class="top-nav-left">
      <BurgerMenu />
    </div>

    <div class="search-box">
      <input
        type="text"
        placeholder="Search sessions..."
        :value="sessions.searchQuery"
        @input="onSearchInput"
      />
    </div>

    <div class="filter-wrap">
      <button
        class="filter-icon-btn"
        :class="{ 'has-filters': sessions.filtersApplied }"
        aria-label="Open filters"
        @click="$emit('open-filters')"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M1.5 3h13M3.5 7h9M5.5 11h5" />
        </svg>
        Filter
      </button>
    </div>

    <div class="top-nav-right">
      <select
        v-if="showEnvSwitcher"
        class="env-switcher active"
        :class="{ single: singleEnv }"
        :value="auth.selectedEnvIdx"
        @change="onEnvChange"
      >
        <option v-for="(env, i) in auth.environments" :key="i" :value="i">{{ env.name }}</option>
      </select>

      <span class="live-badge" :class="{ active: sessions.isLive }" aria-hidden="true">
        <span class="live-dot"></span>Live
      </span>

      <button class="tz-btn" title="Click to change timezone" @click="onTzClick">
        <span>{{ tzLabel }}</span>
      </button>

      <button class="disconnect-btn" aria-label="Refresh sessions" @click="onRefresh">Refresh</button>
    </div>
  </div>
</template>

<style scoped>
.top-nav {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: var(--sidebar-bg);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.top-nav-left {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
}

.top-nav-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.search-box {
  flex: 1;
  max-width: 320px;
  padding: 0;
  border: none;
}
.search-box input {
  width: 100%;
  padding: 7px 14px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--bg);
  font-size: 13px;
  outline: none;
}
.search-box input:focus {
  border-color: var(--accent);
}
.search-box input:disabled {
  /* Keep the legacy fill — browser default fade looks off against the bar. */
  background: var(--bg);
  opacity: 0.6;
  cursor: not-allowed;
}

.filter-wrap {
  position: relative;
}
.filter-icon-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}
.filter-icon-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.filter-icon-btn.has-filters {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.filter-icon-btn.has-filters:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}
.filter-icon-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.filter-icon-btn svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.env-switcher {
  display: none;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--env-bg);
  color: var(--env-text);
  border: 1px solid var(--env-border);
  outline: none;
  cursor: pointer;
  white-space: nowrap;
  max-width: 120px;
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%233949ab'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 6px center;
  padding-right: 18px;
}
.env-switcher.active {
  display: inline-block;
}
.env-switcher:hover {
  border-color: var(--env-text);
}
.env-switcher.single {
  pointer-events: none;
  background-image: none;
  padding-right: 8px;
}

.live-badge {
  display: none;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
  padding: 3px 8px;
  border: 1px solid var(--accent);
  border-radius: 10px;
  white-space: nowrap;
}
.live-badge.active {
  display: flex;
}
.live-dot {
  width: 6px;
  height: 6px;
  background: var(--accent);
  border-radius: 50%;
  animation: live-pulse 1.5s ease-in-out infinite;
  flex-shrink: 0;
}
@keyframes live-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.4; transform: scale(0.85); }
}

.tz-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
}
.tz-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.tz-btn:disabled {
  cursor: not-allowed;
  opacity: 0.85;
}

.disconnect-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 5px 10px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
}
.disconnect-btn:hover {
  border-color: var(--danger);
  color: var(--danger);
}
</style>
