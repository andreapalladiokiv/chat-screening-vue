<script setup lang="ts">
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();

async function onSignOut() {
  await auth.signOut();
}
</script>

<template>
  <header class="top-nav">
    <div class="top-nav-left">
      <h1>Chat View</h1>
      <span class="env-badge">{{ auth.selectedEnv?.name }}</span>
    </div>
    <div class="top-nav-right">
      <span class="user-email">{{ auth.user?.email }}</span>
      <button class="signout-btn" @click="onSignOut">Sign out</button>
    </div>
  </header>
</template>

<style scoped>
.top-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
}

.top-nav-left,
.top-nav-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.env-badge {
  padding: 3px 8px;
  background: var(--accent);
  color: white;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.user-email {
  font-size: 13px;
  color: var(--text-secondary);
}

.signout-btn {
  padding: 6px 12px;
  background: var(--surface);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 13px;
  cursor: pointer;
}

.signout-btn:hover {
  border-color: var(--accent);
}
</style>
