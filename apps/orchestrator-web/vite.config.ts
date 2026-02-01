import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [react()],
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
      // Collaborate routes - proxy to main server (port 3456)
      '/api/channels': {
        target: 'http://localhost:3456',
        changeOrigin: true,
      },
      '/api/libraries': {
        target: 'http://localhost:3456',
        changeOrigin: true,
      },
      '/api/documents': {
        target: 'http://localhost:3456',
        changeOrigin: true,
      },
      '/api/messages': {
        target: 'http://localhost:3456',
        changeOrigin: true,
      },
      '/api/elements': {
        target: 'http://localhost:3456',
        changeOrigin: true,
      },
      '/api/entities': {
        target: 'http://localhost:3456',
        changeOrigin: true,
      },
      '/api/notifications': {
        target: 'http://localhost:3456',
        changeOrigin: true,
      },
      // Orchestrator routes - proxy to orchestrator server (port 3457)
      '/api': {
        target: 'http://localhost:3457',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3457',
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
        },
      },
    },
    chunkSizeWarningLimit: 1000,
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
