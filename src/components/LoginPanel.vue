<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();

const redirecting = ref(false);

const showEnvDropdown = computed(() => auth.environments.length > 1);
const noEnvs = computed(() => auth.environments.length === 0);

function onEnvChange(e: Event) {
  const idx = parseInt((e.target as HTMLSelectElement).value, 10);
  auth.selectEnv(idx);
}

async function onSignIn() {
  // If the user landed back on /login while still authenticated (e.g. Back
  // nav after OAuth), skip the round-trip and just go to /app.
  if (auth.isAuthenticated) {
    router.push({ name: 'app' });
    return;
  }
  redirecting.value = true;
  await auth.signInWithGoogle();
  // On success the browser navigates away; if signInWithGoogle returns with
  // an error, the auth store sets auth.error and we re-enable the button.
  if (auth.error) redirecting.value = false;
}
</script>

<template>
  <div class="login-panel">
    <div class="login-card">
      <h1>Chat View</h1>
      <p>Sign in with your Google account to access your chat conversations.</p>

      <div v-if="noEnvs" class="login-error visible">
        No environments configured. Set <code>VITE_ENV_NAMES</code> / <code>VITE_ENV_PROJECT_IDS</code> /
        <code>VITE_ENV_ANON_KEYS</code> in <code>.env.local</code>.
      </div>

      <div v-if="showEnvDropdown" class="env-selector">
        <label for="env-select">Environment</label>
        <select id="env-select" :value="auth.selectedEnvIdx" @change="onEnvChange">
          <option v-for="(env, i) in auth.environments" :key="i" :value="i">{{ env.name }}</option>
        </select>
      </div>

      <button
        class="btn google-btn"
        :disabled="noEnvs || auth.initialising || redirecting"
        @click="onSignIn"
      >
        <template v-if="redirecting">Redirecting to Google...</template>
        <template v-else>
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" style="flex-shrink: 0">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Sign in with Google
        </template>
      </button>

      <div v-if="auth.error" class="login-error visible">{{ auth.error }}</div>
    </div>
  </div>
</template>

<style scoped>
.login-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%);
}

.login-card {
  background: #fff;
  padding: 40px;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  width: 400px;
  max-width: 90vw;
}

.login-card h1 {
  font-size: 24px;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.login-card p {
  color: var(--text-secondary);
  margin-bottom: 24px;
  font-size: 14px;
}

.env-selector {
  margin-bottom: 20px;
}

.env-selector label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.env-selector select {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 14px;
  color: var(--text-primary);
  background-color: #fff;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23667781' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 36px;
  outline: none;
  cursor: pointer;
  transition: border-color 0.2s;
}

.env-selector select:focus {
  border-color: var(--accent);
}

.btn {
  width: 100%;
  padding: 12px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.btn:hover:not(:disabled) {
  background: var(--accent-hover);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.google-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: #fff;
  color: #3c4043;
  border: 1px solid var(--border);
  font-weight: 500;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.google-btn:hover:not(:disabled) {
  background: #f8f8f8;
}

.login-error {
  color: var(--danger);
  font-size: 13px;
  text-align: center;
  margin-top: 12px;
}

.login-error.visible {
  display: block;
}
</style>
