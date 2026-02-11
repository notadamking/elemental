# Monaco LSP Integration

This module provides Language Server Protocol (LSP) support for the Monaco editor in the orchestrator web app. It enables rich TypeScript/JavaScript code intelligence features:

- **Autocompletion** - IntelliSense suggestions as you type
- **Hover Information** - Type information and documentation on hover
- **Diagnostics** - Inline error and warning markers
- **Go-to-Definition** - Cmd/Ctrl+click to navigate to definitions
- **Syntax Highlighting** - TextMate-based highlighting for 100+ languages

## Architecture

The integration uses:

- `monaco-languageclient` - Bridges Monaco editor with language servers
- `@codingame/monaco-vscode-api` - Provides VS Code API compatibility
- Web Workers - Runs language services in background threads

```
┌─────────────────────────────────────────────────────────────┐
│                      React Component                        │
│                    (LspMonacoEditor)                        │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│              Monaco VSCode API Services                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │   Language   │ │   TextMate   │ │ TypeScript Extension │ │
│  │   Service    │ │   Service    │ │     (built-in)       │ │
│  └──────────────┘ └──────────────┘ └──────────────────────┘ │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                       Web Workers                           │
│  ┌──────────────────────┐ ┌───────────────────────────────┐ │
│  │   Editor Worker      │ │     TextMate Worker           │ │
│  │   (basic editing)    │ │   (syntax highlighting)       │ │
│  └──────────────────────┘ └───────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Usage

### Basic Usage with React Component

```tsx
import { LspMonacoEditor } from '../../components/editor/LspMonacoEditor';

function MyEditor() {
  const [content, setContent] = useState('const x: number = 42;');

  return (
    <LspMonacoEditor
      value={content}
      language="typescript"
      onChange={setContent}
      onMount={(editor, monaco) => {
        // Access editor instance if needed
      }}
    />
  );
}
```

### Using the Hook

```tsx
import { useLspEditor } from '../../lib/monaco-lsp';

function CustomEditor() {
  const { containerRef, isReady, hasLspSupport, error } = useLspEditor({
    value: 'const x = 42;',
    language: 'javascript',
    onChange: (value) => console.log('Changed:', value),
  });

  return (
    <div ref={containerRef} style={{ height: '400px' }}>
      {!isReady && <div>Loading...</div>}
      {hasLspSupport && <span>LSP enabled</span>}
    </div>
  );
}
```

### Programmatic API

```tsx
import { initializeMonacoLsp, createLspEditor, getMonaco } from '../../lib/monaco-lsp';

// Initialize LSP services (call once at app startup)
await initializeMonacoLsp();

// Create an editor
const { editor, model, dispose } = createLspEditor({
  container: document.getElementById('editor'),
  value: 'const greeting: string = "Hello";',
  language: 'typescript',
});

// Access Monaco APIs
const monaco = getMonaco();

// Cleanup when done
dispose();
```

## Supported Languages

Full LSP support (autocompletion, hover, diagnostics):
- TypeScript (`.ts`)
- JavaScript (`.js`)
- TypeScript React (`.tsx`)
- JavaScript React (`.jsx`)

Syntax highlighting only (via TextMate):
- JSON, YAML, Markdown
- Python, Go, Rust
- HTML, CSS, SCSS
- Shell/Bash
- And 100+ more languages

## Configuration

### Vite Configuration

The `vite.config.ts` is configured with:

```ts
import importMetaUrlPlugin from '@codingame/esbuild-import-meta-url-plugin';

export default defineConfig({
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    esbuildOptions: {
      plugins: [importMetaUrlPlugin],
    },
  },
});
```

### Dependencies

Core dependencies installed in `package.json`:
- `monaco-languageclient@10.7.0`
- `@codingame/monaco-vscode-api@25.1.2`
- `@codingame/monaco-vscode-editor-api@25.1.2`
- Service overrides for languages, textmate, theme, model, configuration
- Default extensions for TypeScript and themes

## File Structure

```
src/lib/monaco-lsp/
├── index.ts           # Public exports
├── lsp-setup.ts       # VSCode services initialization
├── lsp-editor.ts      # Editor factory with LSP config
├── languages.ts       # Language support utilities
├── use-lsp-editor.ts  # React hook for LSP editor
└── README.md          # This documentation
```

## Performance

- **Lazy Loading**: Monaco and LSP services are loaded on-demand
- **Web Workers**: Language services run in background threads
- **Chunking**: Vite splits Monaco into separate chunks for caching
- **Single Initialization**: Services are initialized once and reused

## Troubleshooting

### Editor not showing completions

1. Check if the file has a supported language (`.ts`, `.tsx`, `.js`, `.jsx`)
2. Verify the editor is not in read-only mode
3. Check browser console for initialization errors

### High memory usage

The Monaco VSCode API includes many features. Consider:
- Using dynamic imports to load the editor on demand
- Disposing editors when they're no longer visible

### Build size

The Monaco core chunk is large (~6MB). This is expected and is heavily cached by browsers.
