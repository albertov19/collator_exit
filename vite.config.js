import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the built assets resolve correctly whether the site is served
// from a user/organization Pages root (https://user.github.io/) or a project
// subpath (https://user.github.io/<repo>/). No client-side router is used, so a
// relative base is safe.
export default defineConfig({
  base: './',
  // Some @polkadot/* transitive deps reference `global`; map it to globalThis
  // so the browser build doesn't hit "global is not defined" at runtime.
  define: { global: 'globalThis' },
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
});
