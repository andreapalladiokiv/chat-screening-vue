<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();

onMounted(async () => {
  await auth.init();
});

// Auto-redirect to /login when the user becomes unauthenticated on a
// protected route (signOut, session expiry). We deliberately do NOT
// auto-redirect /login → /app when authenticated — Back-nav from /app
// should leave the user on /login if that's where they navigated to.
// The Login route's Sign In handler short-circuits to /app when already
// authenticated, so the explicit click still works without an OAuth round-trip.
watch(
  () => auth.isAuthenticated,
  (loggedIn) => {
    if (auth.initialising) return;
    const route = router.currentRoute.value;
    if (!loggedIn && route.meta.requiresAuth) {
      router.push({ name: 'login' });
    }
  },
);
</script>

<template>
  <RouterView />
</template>
