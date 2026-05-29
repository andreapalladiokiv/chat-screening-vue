<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);

function toggle(e: Event) {
  e.stopPropagation();
  open.value = !open.value;
}

function onDocumentClick(e: MouseEvent) {
  if (!open.value) return;
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) {
    open.value = false;
  }
}

async function onLogout() {
  open.value = false;
  await auth.signOut();
}

onMounted(() => document.addEventListener('click', onDocumentClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick));

// TODO (later M2): real role + Users/Invite modals.
const role = 'user';
const isAdmin = false;
</script>

<template>
  <div ref="rootRef" class="burger-wrap">
    <button class="burger-btn" title="Menu" aria-label="User menu" @click="toggle">&#9776;</button>

    <div class="burger-dropdown" :class="{ open }">
      <div class="burger-user-info">
        <div class="burger-user-email">{{ auth.user?.email }}</div>
        <span class="burger-user-role" :class="{ 'role-admin': isAdmin }">{{ role }}</span>
      </div>

      <button class="burger-menu-item" disabled title="Lands in a later M2 sub-milestone">
        <span>&#128101;</span> Users
      </button>
      <button v-if="isAdmin" class="burger-menu-item" disabled title="Lands in a later M2 sub-milestone">
        <span>&#9993;</span> Invite
      </button>

      <div class="burger-divider"></div>

      <button class="burger-menu-item danger" @click="onLogout">
        <span>&#8618;</span> Logout
      </button>
    </div>
  </div>
</template>

<style scoped>
/* display: contents — the wrapper div has to exist (Vue components need a
 * single template root) but should not generate its own box. This way
 * BurgerMenu drops the button + dropdown straight into the parent
 * (.top-nav-left), matching legacy's flat structure exactly. The dropdown
 * still positions relative to .top-nav-left which is position: relative. */
.burger-wrap {
  display: contents;
}

.burger-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 6px;
  font-size: 22px;
  line-height: 1;
  color: var(--text-primary);
  border-radius: 4px;
}
.burger-btn:hover {
  background: var(--bg);
}

.burger-dropdown {
  display: none;
  position: absolute;
  top: calc(100% + 4px);
  left: 12px;
  min-width: 220px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  z-index: var(--z-dropdown);
  overflow: hidden;
}
.burger-dropdown.open {
  display: block;
}

.burger-user-info {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}
.burger-user-email {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.burger-user-role {
  display: inline-block;
  margin-top: 4px;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--badge-bg);
  color: var(--badge-text);
}
.burger-user-role.role-admin {
  background: var(--admin-badge-bg);
  color: var(--admin-badge-text);
}

.burger-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 14px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
  text-align: left;
}
.burger-menu-item > span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  flex-shrink: 0;
  font-size: 15px;
}
.burger-menu-item:hover:not(:disabled) {
  background: var(--bg);
}
.burger-menu-item.danger {
  color: var(--danger);
}
.burger-menu-item.danger:hover {
  background: var(--danger-light);
}
.burger-menu-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.burger-divider {
  height: 1px;
  background: var(--border);
}
</style>
