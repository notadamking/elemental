/**
 * Spike Test: @codingame/monaco-vscode-api compatibility
 *
 * This file tests whether @codingame/monaco-vscode-api can be initialized
 * alongside our existing Monaco setup without conflicts.
 *
 * Test goals:
 * 1. Initialize @codingame services (theme, textmate, model, languages)
 * 2. Create a Monaco editor instance
 * 3. Verify lightweight LSP client providers still work
 */

import { initialize } from '@codingame/monaco-vscode-api/services';

// Service override imports - these provide VSCode-compatible services
import getThemeServiceOverride from '@codingame/monaco-vscode-theme-service-override';
import getTextmateServiceOverride from '@codingame/monaco-vscode-textmate-service-override';
import getModelServiceOverride from '@codingame/monaco-vscode-model-service-override';
import getConfigurationServiceOverride from '@codingame/monaco-vscode-configuration-service-override';
import getLanguagesServiceOverride from '@codingame/monaco-vscode-languages-service-override';

// Theme defaults extension (provides VS Code's default themes)
import '@codingame/monaco-vscode-theme-defaults-default-extension';

// Monaco editor types
import type * as monacoTypes from 'monaco-editor';

/**
 * Initialize @codingame/monaco-vscode-api services
 *
 * IMPORTANT: This must be called BEFORE creating any editor instances.
 * The initialize() function replaces Monaco's internal service registry.
 */
export async function initializeCodingameServices(): Promise<void> {
  console.log('[codingame-test] Initializing @codingame/monaco-vscode-api services...');

  try {
    await initialize({
      ...getThemeServiceOverride(),
      ...getTextmateServiceOverride(),
      ...getModelServiceOverride(),
      ...getConfigurationServiceOverride(),
      ...getLanguagesServiceOverride(),
    });
    console.log('[codingame-test] @codingame services initialized successfully');
  } catch (error) {
    console.error('[codingame-test] Failed to initialize @codingame services:', error);
    throw error;
  }
}

/**
 * Test creating a Monaco editor instance after @codingame initialization
 */
export async function testEditorCreation(
  container: HTMLElement,
  monacoInstance: typeof monacoTypes
): Promise<monacoTypes.editor.IStandaloneCodeEditor> {
  console.log('[codingame-test] Creating editor instance...');

  const editor = monacoInstance.editor.create(container, {
    value: '// Test content\nconsole.log("Hello from @codingame test");',
    language: 'typescript',
    theme: 'vs-dark',
    automaticLayout: true,
  });

  console.log('[codingame-test] Editor created successfully');
  return editor;
}

/**
 * Test that Monaco language providers can still be registered
 * (simulates what the lightweight LSP client does)
 */
export function testProviderRegistration(
  monacoInstance: typeof monacoTypes,
  language: string = 'typescript'
): monacoTypes.IDisposable[] {
  console.log(`[codingame-test] Testing provider registration for ${language}...`);

  const disposables: monacoTypes.IDisposable[] = [];

  // Test completion provider registration
  disposables.push(
    monacoInstance.languages.registerCompletionItemProvider(language, {
      triggerCharacters: ['.'],
      provideCompletionItems: () => {
        console.log('[codingame-test] Completion provider called');
        return { suggestions: [] };
      },
    })
  );

  // Test hover provider registration
  disposables.push(
    monacoInstance.languages.registerHoverProvider(language, {
      provideHover: () => {
        console.log('[codingame-test] Hover provider called');
        return null;
      },
    })
  );

  // Test definition provider registration
  disposables.push(
    monacoInstance.languages.registerDefinitionProvider(language, {
      provideDefinition: () => {
        console.log('[codingame-test] Definition provider called');
        return null;
      },
    })
  );

  console.log('[codingame-test] Provider registration successful');
  return disposables;
}

/**
 * Run full compatibility test
 */
export async function runCompatibilityTest(
  container: HTMLElement,
  monacoInstance: typeof monacoTypes
): Promise<{ success: boolean; error?: Error }> {
  try {
    // Step 1: Initialize @codingame services
    await initializeCodingameServices();

    // Step 2: Create editor
    const editor = await testEditorCreation(container, monacoInstance);

    // Step 3: Test provider registration (simulates lightweight LSP client)
    const disposables = testProviderRegistration(monacoInstance);

    // Step 4: Cleanup
    for (const d of disposables) {
      d.dispose();
    }
    editor.dispose();

    console.log('[codingame-test] All tests passed!');
    return { success: true };
  } catch (error) {
    console.error('[codingame-test] Test failed:', error);
    return { success: false, error: error as Error };
  }
}
