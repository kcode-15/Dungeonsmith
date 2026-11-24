import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT ?? '5000';
const port = Number(rawPort);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Project Pages URL: https://kcode-15.github.io/Dungeonsmith/
// Custom-domain Pages URL: /
const basePath = process.env.BASE_PATH ?? '/';
const clerkPublishableKey = process.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();

if (!clerkPublishableKey) {
  throw new Error(
    'Missing VITE_CLERK_PUBLISHABLE_KEY. Set it in GitHub Actions variables before building the frontend.',
  );
}

const clerkKeyMatch = /^pk_(?:test|live)_([A-Za-z0-9_-]+={0,2})$/.exec(
  clerkPublishableKey,
);

if (!clerkKeyMatch) {
  throw new Error(
    'VITE_CLERK_PUBLISHABLE_KEY must be a Clerk publishable key beginning with pk_test_ or pk_live_.',
  );
}

const clerkFrontendApiHost = Buffer.from(clerkKeyMatch[1], 'base64url')
  .toString('utf8')
  .replace(/\$$/, '')
  .toLowerCase();

if (
  !clerkFrontendApiHost ||
  clerkFrontendApiHost === 'github.io' ||
  clerkFrontendApiHost.endsWith('.github.io')
) {
  throw new Error(
    'VITE_CLERK_PUBLISHABLE_KEY encodes a GitHub Pages host, which cannot serve Clerk. Set the key for the Clerk application’s actual Frontend API domain.',
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss({ optimize: false }),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
