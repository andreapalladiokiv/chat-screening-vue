import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/routes/Login.vue'),
      meta: { requiresAuth: false },
    },
    {
      path: '/',
      name: 'app',
      component: () => import('@/routes/App.vue'),
      meta: { requiresAuth: true },
    },
    {
      // OAuth redirects land here (the access_token is in the URL hash and
      // is picked up by Supabase's onAuthStateChange handler). Either route
      // works — Supabase intercepts the hash before Vue Router resolves it.
      path: '/:catchAll(.*)',
      redirect: '/',
    },
  ],
});

router.beforeEach(async (to: RouteLocationNormalized) => {
  const auth = useAuthStore();

  // Wait for the initial auth resolution before guarding
  if (auth.initialising) {
    await new Promise<void>((resolve) => {
      const stop = setInterval(() => {
        if (!auth.initialising) {
          clearInterval(stop);
          resolve();
        }
      }, 50);
    });
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login' };
  }
  // Note: authenticated user landing on /login is allowed by design — they
  // can navigate back to the login page, see it, and the Sign In button
  // skips OAuth when already authenticated (handled in Login.vue).
});
