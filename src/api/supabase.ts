import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Environment } from '@/types/environment';

let client: SupabaseClient | null = null;

export function createSupabaseClient(env: Environment): SupabaseClient {
  const url = `https://${env.projectId}.supabase.co`;
  // PKCE flow returns ?code=... in query (no #access_token hash), and Supabase
  // auto-exchanges it for a session + strips the param from the URL — keeps
  // the access token out of browser history / referer headers entirely.
  client = createClient(url, env.anonKey, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: true,
      autoRefreshToken: true,
      persistSession: true,
    },
  });
  return client;
}

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    throw new Error('Supabase client not initialised — call createSupabaseClient first');
  }
  return client;
}

export function clearSupabaseClient(): void {
  client = null;
}
