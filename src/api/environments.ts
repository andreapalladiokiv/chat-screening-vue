import type { Environment } from '@/types/environment';

const STORAGE_SELECTED_ENV = 'sb_selected_env';

/**
 * Build the environments list from Vite env vars.
 * Each var is comma-separated and aligned by index.
 *
 * VITE_ENV_NAMES=Development,Production,Stage
 * VITE_ENV_PROJECT_IDS=xxx,yyy,zzz
 * VITE_ENV_ANON_KEYS=eyJ...,eyJ...,eyJ...
 * VITE_ENV_ALLOWED_DOMAINS=|kiv.dev|kiv.dev
 *
 * Returns [] when no env names configured — the UI surfaces this as a
 * configuration error instead of crashing.
 */
export function loadEnvironments(): Environment[] {
  const names = (import.meta.env.VITE_ENV_NAMES || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!names.length) return [];

  const projectIds = (import.meta.env.VITE_ENV_PROJECT_IDS || '').split(',').map((s) => s.trim());
  const anonKeys = (import.meta.env.VITE_ENV_ANON_KEYS || '').split(',').map((s) => s.trim());
  const allowedDomainsRaw = (import.meta.env.VITE_ENV_ALLOWED_DOMAINS || '').split(',');

  return names.map((name, i) => ({
    name,
    projectId: projectIds[i] || '',
    anonKey: anonKeys[i] || '',
    allowedDomains: (allowedDomainsRaw[i] || '')
      .split('|')
      .map((d) => d.trim())
      .filter(Boolean),
  }));
}

export function getSelectedEnvIndex(envCount: number): number {
  const stored = parseInt(localStorage.getItem(STORAGE_SELECTED_ENV) || '0', 10);
  if (isNaN(stored) || stored < 0 || stored >= envCount) return 0;
  return stored;
}

export function setSelectedEnvIndex(idx: number): void {
  localStorage.setItem(STORAGE_SELECTED_ENV, String(idx));
}
