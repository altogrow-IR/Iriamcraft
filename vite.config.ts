import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  css: { postcss: { plugins: [tailwindcss()] } },
  server: { host: '0.0.0.0', port: 5173 },
  build: {
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/three/')) return 'three';
          if (/node_modules\/(react|react-dom)\//.test(id)) return 'react';
        },
      },
    },
  },
});
