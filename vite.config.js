import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Relative base so the build works on GitHub Pages (custom domain
// mkce360.nraj.me), Netlify, and inside an Android WebView.
// Two HTML entry points: the app and the privacy policy page
// (served at /privacy-policy/ -> mkce360.nraj.me/privacy-policy).
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        privacy: resolve(import.meta.dirname, 'privacy-policy/index.html'),
      },
    },
  },
  server: {
    host: true, // reachable from a phone on the same Wi-Fi
  },
});
