import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import electron from 'vite-plugin-electron/simple';

// Native Node/Electron modules that must NOT be bundled
const EXTERNAL_MODULES = [
  'better-sqlite3',
  'electron',
  'electron-updater',
  'path',
  'fs',
  'os',
  'url',
  'crypto',
  'child_process',
  'events',
  'stream',
  'util',
];

// The CSP meta of index.html keeps ws:/wss: for the dev server (the HMR
// client talks over a websocket), but the packaged page never opens a
// connection: the build rewrites connect-src down to 'self' so a
// compromised renderer cannot phone anywhere.
const buildStrictCsp: Plugin = {
  name: 'cybernotes-strict-csp',
  apply: 'build',
  transformIndexHtml(html) {
    return html.replace(
      /(<meta[^>]*http-equiv="Content-Security-Policy"[^>]*content=")([^"]*)(")/,
      (meta, head: string, content: string) => head + content.replace(/connect-src[^;"]*/, "connect-src 'self'") + '"',
    );
  },
};

export default defineConfig({
  base: './',
  plugins: [
    buildStrictCsp,
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: EXTERNAL_MODULES,
            },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
      },
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5273,
    hmr: process.env.DISABLE_HMR !== 'true',
  },
});
