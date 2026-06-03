import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // GitHub Pages serves the site under /<repo-name>/. Vite injects this as
  // import.meta.env.BASE_URL, which router and OAuth redirect consume.
  base: mode === 'production' ? '/chat-screening-vue/' : '/',
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
