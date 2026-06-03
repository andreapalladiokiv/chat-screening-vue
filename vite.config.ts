import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig(() => ({
  // Read base path from env so the repo name isn't hardcoded in the config.
  // The deploy workflow sets BASE_URL=/chat-screening-vue/; in dev it's
  // unset → '/'. Vite re-exports this as import.meta.env.BASE_URL, which
  // the router and OAuth redirect both consume.
  base: process.env.BASE_URL ?? '/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true, // listen on 0.0.0.0 so the Docker container is reachable
    strictPort: true,
  },
}));
