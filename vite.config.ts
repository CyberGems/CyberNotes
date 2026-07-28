import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
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

export default defineConfig({
  base: './',
  plugins: [
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
    hmr: process.env.DISABLE_HMR !== 'true',
  },
});
