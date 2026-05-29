import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Environment } from '@/types/environment';

let client: SupabaseClient | null = null;

export function createSupabaseClient(env: Environment): SupabaseClient {
  const url = `https://${env.projectId}.supabase.co`;
  client = createClient(url, env.anonKey);
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
