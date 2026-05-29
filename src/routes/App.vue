<script setup lang="ts">
import { useAuthStore } from '@/stores/auth';
import TopNav from '@/components/TopNav.vue';

const auth = useAuthStore();
</script>

<template>
  <div class="shell">
    <TopNav />
    <main class="content">
      <div class="placeholder">
        <h2>Authenticated shell</h2>
        <p>Session list, chat view, filters, and detail sidebar will land here in M2.</p>
        <p class="hint">
          You're signed in as <strong>{{ auth.user?.email }}</strong> against <strong>{{ auth.selectedEnv?.name }}</strong>.
        </p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg);
}

.content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

.placeholder {
  text-align: center;
  max-width: 480px;
}

.placeholder h2 {
  margin: 0 0 12px;
  font-size: 20px;
  color: var(--text-primary);
}

.placeholder p {
  margin: 0 0 8px;
  color: var(--text-secondary);
}

.placeholder .hint {
  margin-top: 20px;
  padding: 12px 16px;
  background: var(--surface);
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  font-size: 13px;
}
</style>
