import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { User, Session, Subscription } from '@supabase/supabase-js';
import {
  loadEnvironments,
  getSelectedEnvIndex,
  setSelectedEnvIndex,
} from '@/api/environments';
import {
  createSupabaseClient,
  getSupabaseClient,
  clearSupabaseClient,
} from '@/api/supabase';
import type { Environment } from '@/types/environment';

export const useAuthStore = defineStore('auth', () => {
  const environments = ref<Environment[]>(loadEnvironments());
  const selectedEnvIdx = ref<number>(getSelectedEnvIndex(environments.value.length));
  const user = ref<User | null>(null);
  const initialising = ref(true);
  const error = ref<string | null>(null);

  let authSubscription: Subscription | null = null;

  const selectedEnv = computed<Environment | null>(
    () => environments.value[selectedEnvIdx.value] || null,
  );
  const isAuthenticated = computed(() => user.value !== null);

  /** Display name preference: user_metadata.full_name → user_metadata.name → email.
   * Used in feedback "Submitted by" and could replace TopNav's raw email later. */
  const displayName = computed<string>(() => {
    const u = user.value;
    if (!u) return 'Unknown';
    const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
    const fromMeta =
      (typeof meta.full_name === 'string' && meta.full_name) ||
      (typeof meta.name === 'string' && meta.name) ||
      '';
    return fromMeta || u.email || 'Unknown';
  });

  function selectEnv(idx: number) {
    selectedEnvIdx.value = idx;
    setSelectedEnvIndex(idx);
  }

  /**
   * Init the Supabase client for the selected env and wait for the auth
   * state to resolve. Mirrors the v2 onAuthStateChange + INITIAL_SESSION
   * pattern from legacy app.js — most reliable way to restore sessions and
   * handle OAuth redirect hash tokens across Supabase v2 minor versions.
   */
  async function init(): Promise<void> {
    initialising.value = true;
    error.value = null;

    const env = selectedEnv.value;
    if (!env) {
      error.value = 'No environments configured. Check .env.local.';
      initialising.value = false;
      return;
    }
    if (!env.projectId || !env.anonKey) {
      error.value = `Environment "${env.name}" is missing projectId or anonKey.`;
      initialising.value = false;
      return;
    }

    const db = createSupabaseClient(env);

    // Wait for the first auth state event (INITIAL_SESSION) — with a 5s
    // safety timeout in case Supabase doesn't fire it for some reason.
    const session = await new Promise<Session | null>((resolve) => {
      let resolved = false;
      const { data } = db.auth.onAuthStateChange((event, sess) => {
        if (event === 'INITIAL_SESSION') {
          if (!resolved) {
            resolved = true;
            resolve(sess);
          }
        } else if (event === 'SIGNED_IN') {
          // Some v2 versions fire SIGNED_IN instead of INITIAL_SESSION on OAuth redirect
          if (!resolved) {
            resolved = true;
            resolve(sess);
          }
        } else if (event === 'SIGNED_OUT') {
          if (!resolved) {
            resolved = true;
            resolve(null);
          }
          // Defer to next tick to avoid the async-inside-onAuthStateChange deadlock
          // (https://github.com/supabase/auth-js/issues/762)
          setTimeout(() => handleSignedOut(), 0);
        }
      });
      authSubscription = data.subscription;

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      }, 5000);
    });

    if (session?.user) {
      const allowed = checkDomain(session.user.email || '', env.allowedDomains);
      if (!allowed) {
        await db.auth.signOut();
        user.value = null;
        error.value = `Access restricted. Only accounts from ${env.allowedDomains.join(', ')} are allowed.`;
      } else {
        user.value = session.user;
      }
    }

    // Strip any OAuth tokens left in the URL hash (#access_token=…&refresh_token=…
    // &expires_in=…&token_type=bearer). Supabase v2 usually clears this itself,
    // but the cleanup races with other early code and sometimes leaves the hash
    // behind — we wipe it unconditionally once auth has resolved.
    if (window.location.hash.includes('access_token')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    initialising.value = false;
  }

  function checkDomain(email: string, allowed: string[]): boolean {
    if (!allowed.length) return true;
    const domain = email.split('@')[1] || '';
    return allowed.includes(domain);
  }

  async function signInWithGoogle(): Promise<void> {
    error.value = null;
    const env = selectedEnv.value;
    if (!env) {
      error.value = 'No environment selected.';
      return;
    }
    // Client may have been cleared by a prior signOut — recreate for the
    // currently selected env. createSupabaseClient is idempotent enough that
    // this is also safe when the client was already initialised by init().
    const db = createSupabaseClient(env);
    const { error: err } = await db.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Always land on the app root after OAuth — keeps the access_token
        // hash off /login URLs in browser history.
        redirectTo: window.location.origin + import.meta.env.BASE_URL,
      },
    });
    if (err) error.value = `Failed to start Google sign-in: ${err.message}`;
    // On success the browser navigates away — no further code runs here.
  }

  async function signOut(): Promise<void> {
    try {
      await getSupabaseClient().auth.signOut();
    } catch {
      // ignore
    }
    handleSignedOut();
  }

  /**
   * Switch to a different environment: sign out of the current one and start
   * a fresh OAuth round-trip against the new one. Mirrors legacy handleEnvSwitch.
   * The browser navigates away on the OAuth call — no UI restore needed.
   */
  async function switchEnv(idx: number): Promise<void> {
    const target = environments.value[idx];
    if (!target) return;

    selectEnv(idx);

    try {
      await getSupabaseClient().auth.signOut();
    } catch {
      // ignore — may already be signed out
    }
    handleSignedOut();

    const db = createSupabaseClient(target);
    const { error: err } = await db.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + import.meta.env.BASE_URL },
    });
    if (err) error.value = `Failed to switch environment: ${err.message}`;
  }

  function handleSignedOut(): void {
    user.value = null;
    clearSupabaseClient();
    authSubscription?.unsubscribe();
    authSubscription = null;
  }

  return {
    environments,
    selectedEnvIdx,
    selectedEnv,
    user,
    isAuthenticated,
    displayName,
    initialising,
    error,
    selectEnv,
    init,
    signInWithGoogle,
    signOut,
  };
});
