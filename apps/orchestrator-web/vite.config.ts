import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Allow tests to override the API port via VITE_API_PORT env var
const apiPort = process.env.VITE_API_PORT || '3457';

export default defineConfig({
  plugins: [react()],
  test: {
    // Exclude Playwright E2E tests from Vitest unit test runs
    exclude: [
      '**/node_modules/**',
      '**/tests/**', // Playwright E2E tests
    ],
    // Include unit tests in src/ directories
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      react: resolve(__dirname, 'node_modules/react'),
      'react-dom': resolve(__dirname, 'node_modules/react-dom'),
    },
  },
  server: {
    port: 5174, // Different port from main web app (5173)
    proxy: {
      // All API routes go to orchestrator server (includes shared collaborate routes)
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://localhost:${apiPort}`,
        ws: true,
      },
    },
  },
  build: {
    minify: 'esbuild',
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: false,
    rollupOptions: {
      // Suppress warnings from @codingame/monaco-vscode-theme-defaults-default-extension
      // which uses new URL("./resources/*.svg", import.meta.url) for file icons that
      // don't exist at the resolved path during build (they're embedded in the package)
      onwarn(warning, warn) {
        if (warning.message?.includes("doesn't exist at build time")) return;
        warn(warning);
      },
      output: {
        manualChunks: {
          'router-vendor': ['@tanstack/react-router', '@tanstack/react-query'],
          'ui-vendor': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-collapsible',
          ],
          'utils-vendor': ['lucide-react', 'cmdk', 'sonner'],
          // Monaco editor in a separate chunk for better caching
          'monaco-editor': ['monaco-editor'],
        },
      },
    },
    chunkSizeWarningLimit: 1500, // Increased for monaco chunks
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@tanstack/react-router',
      '@tanstack/react-query',
      'lucide-react',
      'react-resizable-panels',
    ],
  },
});
