import { defineConfig } from 'vite';

// Relative base so the build works on GitHub Pages sub-paths, Netlify,
// and inside an Android WebView loading from file:// or a local asset path.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 700,
  },
  server: {
    host: true, // reachable from a phone on the same Wi-Fi
  },
});
