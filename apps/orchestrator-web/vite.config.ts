import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import importMetaUrlPlugin from '@codingame/esbuild-import-meta-url-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Allow tests to override the API port via VITE_API_PORT env var
const apiPort = process.env.VITE_API_PORT || '3457';

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
  worker: {
    format: 'es',
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
          // Monaco and LSP packages in separate chunks for better caching
          'monaco-core': ['@codingame/monaco-vscode-api', '@codingame/monaco-vscode-editor-api'],
          'monaco-services': [
            '@codingame/monaco-vscode-languages-service-override',
            '@codingame/monaco-vscode-textmate-service-override',
            '@codingame/monaco-vscode-theme-service-override',
            '@codingame/monaco-vscode-model-service-override',
            '@codingame/monaco-vscode-configuration-service-override',
          ],
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
    esbuildOptions: {
      plugins: [importMetaUrlPlugin],
    },
  },
});
