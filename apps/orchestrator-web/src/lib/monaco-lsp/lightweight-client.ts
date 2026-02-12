/**
 * Lightweight LSP Client
 *
 * A minimal Language Server Protocol client that works with vanilla Monaco editor
 * without requiring @codingame/monaco-vscode-api initialization.
 *
 * Uses vscode-ws-jsonrpc for JSON-RPC over WebSocket transport and manually
 * registers Monaco language providers for completion, hover, and diagnostics.
 */

import {
  createMessageConnection,
  MessageConnection,
  Disposable,
} from 'vscode-jsonrpc/browser';
import {
  toSocket,
  WebSocketMessageReader,
  WebSocketMessageWriter,
} from 'vscode-ws-jsonrpc';
import type {
  InitializeParams,
  InitializeResult,
  DidOpenTextDocumentParams,
  DidChangeTextDocumentParams,
  DidCloseTextDocumentParams,
  CompletionParams,
  CompletionItem as LspCompletionItem,
  CompletionList,
  HoverParams,
  Hover as LspHover,
  DefinitionParams,
  Location,
  LocationLink,
  PublishDiagnosticsParams,
  Diagnostic,
  DiagnosticSeverity,
  CompletionItemKind,
  MarkupContent,
  ServerCapabilities,
} from 'vscode-languageserver-protocol';
import type * as monaco from 'monaco-editor';

/**
 * Lightweight LSP client options
 */
export interface LightweightLspClientOptions {
  /** WebSocket instance for LSP communication */
  socket: WebSocket;
  /** Language ID for filtering capabilities */
  language: string;
  /** Monaco editor instance for provider registration */
  monaco: typeof monaco;
  /** Workspace root URI (file://...) */
  workspaceRootUri?: string;
  /** Workspace name */
  workspaceName?: string;
}

/**
 * Document state tracked by the client
 */
interface TrackedDocument {
  uri: string;
  languageId: string;
  version: number;
  content: string;
}

/**
 * Lightweight LSP client that registers Monaco providers directly
 */
export class LightweightLspClient {
  private connection: MessageConnection | null = null;
  private socket: WebSocket;
  private language: string;
  private monacoInstance: typeof monaco;
  private workspaceRootUri?: string;
  private workspaceName?: string;

  private serverCapabilities: ServerCapabilities | null = null;
  private trackedDocuments = new Map<string, TrackedDocument>();
  private disposables: Disposable[] = [];
  private monacoDisposables: monaco.IDisposable[] = [];

  // Callbacks for connection state
  private onConnectedCallbacks: (() => void)[] = [];
  private onDisconnectedCallbacks: (() => void)[] = [];
  private onErrorCallbacks: ((error: Error) => void)[] = [];

  constructor(options: LightweightLspClientOptions) {
    this.socket = options.socket;
    this.language = options.language;
    this.monacoInstance = options.monaco;
    this.workspaceRootUri = options.workspaceRootUri;
    this.workspaceName = options.workspaceName;
  }

  /**
   * Start the LSP client and initialize the connection
   */
  async start(): Promise<void> {
    if (this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }

    // Create JSON-RPC message connection
    const socketWrapper = toSocket(this.socket);
    const reader = new WebSocketMessageReader(socketWrapper);
    const writer = new WebSocketMessageWriter(socketWrapper);
    this.connection = createMessageConnection(reader, writer);

    // Set up notification handlers
    this.setupNotificationHandlers();

    // Start listening
    this.connection.listen();

    // Initialize the language server
    await this.initializeServer();

    // Register Monaco providers
    this.registerMonacoProviders();

    // Notify connected
    this.onConnectedCallbacks.forEach((cb) => cb());
  }

  /**
   * Stop the LSP client and clean up
   */
  async stop(): Promise<void> {
    // Dispose Monaco providers
    this.monacoDisposables.forEach((d) => d.dispose());
    this.monacoDisposables = [];

    // Dispose connection handlers
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];

    // Send shutdown request and exit notification
    if (this.connection) {
      try {
        await this.connection.sendRequest('shutdown');
        this.connection.sendNotification('exit');
      } catch {
        // Ignore errors during shutdown
      }
      this.connection.dispose();
      this.connection = null;
    }

    // Clear tracked documents
    this.trackedDocuments.clear();

    // Clear server capabilities
    this.serverCapabilities = null;
  }

  /**
   * Register a callback for when the client connects
   */
  onConnected(callback: () => void): () => void {
    this.onConnectedCallbacks.push(callback);
    return () => {
      const idx = this.onConnectedCallbacks.indexOf(callback);
      if (idx >= 0) this.onConnectedCallbacks.splice(idx, 1);
    };
  }

  /**
   * Register a callback for when the client disconnects
   */
  onDisconnected(callback: () => void): () => void {
    this.onDisconnectedCallbacks.push(callback);
    return () => {
      const idx = this.onDisconnectedCallbacks.indexOf(callback);
      if (idx >= 0) this.onDisconnectedCallbacks.splice(idx, 1);
    };
  }

  /**
   * Register a callback for errors
   */
  onError(callback: (error: Error) => void): () => void {
    this.onErrorCallbacks.push(callback);
    return () => {
      const idx = this.onErrorCallbacks.indexOf(callback);
      if (idx >= 0) this.onErrorCallbacks.splice(idx, 1);
    };
  }

  /**
   * Open a document in the language server
   */
  openDocument(uri: string, languageId: string, content: string): void {
    if (!this.connection) return;

    const version = 1;
    this.trackedDocuments.set(uri, { uri, languageId, version, content });

    const params: DidOpenTextDocumentParams = {
      textDocument: {
        uri,
        languageId,
        version,
        text: content,
      },
    };

    this.connection.sendNotification('textDocument/didOpen', params);
  }

  /**
   * Update a document in the language server
   */
  changeDocument(uri: string, content: string): void {
    if (!this.connection) return;

    const doc = this.trackedDocuments.get(uri);
    if (!doc) return;

    doc.version++;
    doc.content = content;

    const params: DidChangeTextDocumentParams = {
      textDocument: {
        uri,
        version: doc.version,
      },
      contentChanges: [{ text: content }],
    };

    this.connection.sendNotification('textDocument/didChange', params);
  }

  /**
   * Close a document in the language server
   */
  closeDocument(uri: string): void {
    if (!this.connection) return;

    this.trackedDocuments.delete(uri);

    const params: DidCloseTextDocumentParams = {
      textDocument: { uri },
    };

    this.connection.sendNotification('textDocument/didClose', params);
  }

  /**
   * Set up LSP notification handlers
   */
  private setupNotificationHandlers(): void {
    if (!this.connection) return;

    // Handle publishDiagnostics notification
    this.disposables.push(
      this.connection.onNotification(
        'textDocument/publishDiagnostics',
        (params: PublishDiagnosticsParams) => {
          this.handleDiagnostics(params);
        }
      )
    );

    // Handle connection errors
    this.connection.onError((error) => {
      console.error('[lightweight-client] Connection error:', error);
      this.onErrorCallbacks.forEach((cb) => cb(new Error(String(error))));
    });

    // Handle connection close
    this.connection.onClose(() => {
      console.log('[lightweight-client] Connection closed');
      this.onDisconnectedCallbacks.forEach((cb) => cb());
    });
  }

  /**
   * Initialize the language server with proper workspace configuration
   */
  private async initializeServer(): Promise<void> {
    if (!this.connection) return;

    const initParams: InitializeParams = {
      processId: null,
      capabilities: {
        textDocument: {
          synchronization: {
            dynamicRegistration: false,
            willSave: false,
            willSaveWaitUntil: false,
            didSave: true,
          },
          completion: {
            dynamicRegistration: false,
            completionItem: {
              snippetSupport: true,
              commitCharactersSupport: true,
              documentationFormat: ['markdown', 'plaintext'],
              deprecatedSupport: true,
              preselectSupport: true,
              insertReplaceSupport: true,
              labelDetailsSupport: true,
              resolveSupport: {
                properties: ['documentation', 'detail', 'additionalTextEdits'],
              },
            },
            contextSupport: true,
          },
          hover: {
            dynamicRegistration: false,
            contentFormat: ['markdown', 'plaintext'],
          },
          definition: {
            dynamicRegistration: false,
            linkSupport: true,
          },
          publishDiagnostics: {
            relatedInformation: true,
            tagSupport: { valueSet: [1, 2] },
            codeDescriptionSupport: true,
          },
        },
        workspace: {
          workspaceFolders: true,
        },
      },
      rootUri: this.workspaceRootUri ?? null,
      workspaceFolders: this.workspaceRootUri
        ? [
            {
              uri: this.workspaceRootUri,
              name: this.workspaceName ?? 'workspace',
            },
          ]
        : null,
    };

    console.log('[lightweight-client] Sending initialize request with rootUri:', this.workspaceRootUri);

    const result: InitializeResult = await this.connection.sendRequest(
      'initialize',
      initParams
    );

    this.serverCapabilities = result.capabilities;
    console.log('[lightweight-client] Server initialized, capabilities:', result.capabilities);

    // Send initialized notification
    this.connection.sendNotification('initialized', {});
  }

  /**
   * Register Monaco language providers
   */
  private registerMonacoProviders(): void {
    const caps = this.serverCapabilities;
    if (!caps) return;

    // Register completion provider
    if (caps.completionProvider) {
      const completionProvider: monaco.languages.CompletionItemProvider = {
        triggerCharacters: caps.completionProvider.triggerCharacters,
        provideCompletionItems: async (model, position, context, token) => {
          return this.provideCompletionItems(model, position, context, token);
        },
      };

      const disposable = this.monacoInstance.languages.registerCompletionItemProvider(
        this.language,
        completionProvider
      );
      this.monacoDisposables.push(disposable);
      console.log('[lightweight-client] Registered completion provider for', this.language);
    }

    // Register hover provider
    if (caps.hoverProvider) {
      const hoverProvider: monaco.languages.HoverProvider = {
        provideHover: async (model, position, token) => {
          return this.provideHover(model, position, token);
        },
      };

      const disposable = this.monacoInstance.languages.registerHoverProvider(
        this.language,
        hoverProvider
      );
      this.monacoDisposables.push(disposable);
      console.log('[lightweight-client] Registered hover provider for', this.language);
    }

    // Register definition provider
    if (caps.definitionProvider) {
      const definitionProvider: monaco.languages.DefinitionProvider = {
        provideDefinition: async (model, position, token) => {
          return this.provideDefinition(model, position, token);
        },
      };

      const disposable = this.monacoInstance.languages.registerDefinitionProvider(
        this.language,
        definitionProvider
      );
      this.monacoDisposables.push(disposable);
      console.log('[lightweight-client] Registered definition provider for', this.language);
    }
  }

  /**
   * Handle diagnostics from the language server
   */
  private handleDiagnostics(params: PublishDiagnosticsParams): void {
    const uri = params.uri;
    const model = this.monacoInstance.editor
      .getModels()
      .find((m) => m.uri.toString() === uri);

    if (!model) {
      console.log('[lightweight-client] No model found for diagnostics URI:', uri);
      return;
    }

    const markers = params.diagnostics.map((diag) => this.toMonacoMarker(diag));
    this.monacoInstance.editor.setModelMarkers(model, 'lsp', markers);
    console.log(`[lightweight-client] Set ${markers.length} markers for ${uri}`);
  }

  /**
   * Convert LSP Diagnostic to Monaco IMarkerData
   */
  private toMonacoMarker(diagnostic: Diagnostic): monaco.editor.IMarkerData {
    return {
      severity: this.toMonacoSeverity(diagnostic.severity),
      message: diagnostic.message,
      startLineNumber: diagnostic.range.start.line + 1, // LSP is 0-based, Monaco is 1-based
      startColumn: diagnostic.range.start.character + 1,
      endLineNumber: diagnostic.range.end.line + 1,
      endColumn: diagnostic.range.end.character + 1,
      source: diagnostic.source,
      code:
        typeof diagnostic.code === 'number'
          ? String(diagnostic.code)
          : diagnostic.code,
    };
  }

  /**
   * Convert LSP DiagnosticSeverity to Monaco MarkerSeverity
   */
  private toMonacoSeverity(
    severity?: DiagnosticSeverity
  ): monaco.MarkerSeverity {
    // DiagnosticSeverity values: Error = 1, Warning = 2, Information = 3, Hint = 4
    switch (severity) {
      case 1: // DiagnosticSeverity.Error
        return this.monacoInstance.MarkerSeverity.Error;
      case 2: // DiagnosticSeverity.Warning
        return this.monacoInstance.MarkerSeverity.Warning;
      case 3: // DiagnosticSeverity.Information
        return this.monacoInstance.MarkerSeverity.Info;
      case 4: // DiagnosticSeverity.Hint
        return this.monacoInstance.MarkerSeverity.Hint;
      default:
        return this.monacoInstance.MarkerSeverity.Info;
    }
  }

  /**
   * Provide completion items from the language server
   */
  private async provideCompletionItems(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    _context: monaco.languages.CompletionContext,
    _token: monaco.CancellationToken
  ): Promise<monaco.languages.CompletionList | null> {
    if (!this.connection) return null;

    const params: CompletionParams = {
      textDocument: { uri: model.uri.toString() },
      position: {
        line: position.lineNumber - 1, // Monaco is 1-based, LSP is 0-based
        character: position.column - 1,
      },
    };

    try {
      const result = await this.connection.sendRequest<CompletionList | LspCompletionItem[] | null>(
        'textDocument/completion',
        params
      );

      if (!result) return null;

      const items = Array.isArray(result)
        ? result
        : (result as CompletionList).items;

      const wordRange = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        startColumn: wordRange.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: wordRange.endColumn,
      };

      const suggestions = items.map((item) =>
        this.toMonacoCompletionItem(item, range)
      );

      return {
        suggestions,
        incomplete: !Array.isArray(result) && (result as CompletionList).isIncomplete,
      };
    } catch (error) {
      console.error('[lightweight-client] Completion request failed:', error);
      return null;
    }
  }

  /**
   * Convert LSP CompletionItem to Monaco CompletionItem
   */
  private toMonacoCompletionItem(
    item: LspCompletionItem,
    range: monaco.IRange
  ): monaco.languages.CompletionItem {
    // Handle label which can be string or { label: string, ... }
    const labelText = typeof item.label === 'string'
      ? item.label
      : (item.label as { label: string }).label;
    const insertText = item.insertText ?? labelText;
    const insertTextRules = item.insertTextFormat === 2
      ? this.monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet
      : undefined;

    return {
      label: labelText,
      kind: this.toMonacoCompletionKind(item.kind),
      detail: item.detail,
      documentation: this.toMonacoDocumentation(item.documentation),
      sortText: item.sortText,
      filterText: item.filterText,
      insertText,
      insertTextRules,
      range,
    };
  }

  /**
   * Convert LSP CompletionItemKind to Monaco CompletionItemKind
   */
  private toMonacoCompletionKind(
    kind?: CompletionItemKind
  ): monaco.languages.CompletionItemKind {
    const m = this.monacoInstance.languages.CompletionItemKind;
    // CompletionItemKind values from LSP spec
    switch (kind) {
      case 1: return m.Text;
      case 2: return m.Method;
      case 3: return m.Function;
      case 4: return m.Constructor;
      case 5: return m.Field;
      case 6: return m.Variable;
      case 7: return m.Class;
      case 8: return m.Interface;
      case 9: return m.Module;
      case 10: return m.Property;
      case 11: return m.Unit;
      case 12: return m.Value;
      case 13: return m.Enum;
      case 14: return m.Keyword;
      case 15: return m.Snippet;
      case 16: return m.Color;
      case 17: return m.File;
      case 18: return m.Reference;
      case 19: return m.Folder;
      case 20: return m.EnumMember;
      case 21: return m.Constant;
      case 22: return m.Struct;
      case 23: return m.Event;
      case 24: return m.Operator;
      case 25: return m.TypeParameter;
      default: return m.Text;
    }
  }

  /**
   * Convert LSP documentation to Monaco documentation format
   */
  private toMonacoDocumentation(
    documentation?: string | MarkupContent
  ): string | monaco.IMarkdownString | undefined {
    if (!documentation) return undefined;

    if (typeof documentation === 'string') {
      return documentation;
    }

    if (documentation.kind === 'markdown') {
      return { value: documentation.value };
    }

    return documentation.value;
  }

  /**
   * Provide hover information from the language server
   */
  private async provideHover(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    _token: monaco.CancellationToken
  ): Promise<monaco.languages.Hover | null> {
    if (!this.connection) return null;

    const params: HoverParams = {
      textDocument: { uri: model.uri.toString() },
      position: {
        line: position.lineNumber - 1,
        character: position.column - 1,
      },
    };

    try {
      const result = await this.connection.sendRequest<LspHover | null>(
        'textDocument/hover',
        params
      );

      if (!result || !result.contents) return null;

      return this.toMonacoHover(result);
    } catch (error) {
      console.error('[lightweight-client] Hover request failed:', error);
      return null;
    }
  }

  /**
   * Convert LSP Hover to Monaco Hover
   */
  private toMonacoHover(hover: LspHover): monaco.languages.Hover {
    const contents = this.toMonacoHoverContents(hover.contents);
    const range = hover.range
      ? {
          startLineNumber: hover.range.start.line + 1,
          startColumn: hover.range.start.character + 1,
          endLineNumber: hover.range.end.line + 1,
          endColumn: hover.range.end.character + 1,
        }
      : undefined;

    return { contents, range };
  }

  /**
   * Convert LSP hover contents to Monaco IMarkdownString array
   */
  private toMonacoHoverContents(
    contents: LspHover['contents']
  ): monaco.IMarkdownString[] {
    if (typeof contents === 'string') {
      return [{ value: contents }];
    }

    if (Array.isArray(contents)) {
      return contents.map((c) => {
        if (typeof c === 'string') {
          return { value: c };
        }
        if ('language' in c) {
          return { value: `\`\`\`${c.language}\n${c.value}\n\`\`\`` };
        }
        return { value: (c as MarkupContent).value };
      });
    }

    if ('kind' in contents) {
      return [{ value: contents.value }];
    }

    if ('language' in contents) {
      return [{ value: `\`\`\`${contents.language}\n${contents.value}\n\`\`\`` }];
    }

    return [];
  }

  /**
   * Provide definition from the language server
   */
  private async provideDefinition(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    _token: monaco.CancellationToken
  ): Promise<monaco.languages.Definition | null> {
    if (!this.connection) return null;

    const params: DefinitionParams = {
      textDocument: { uri: model.uri.toString() },
      position: {
        line: position.lineNumber - 1,
        character: position.column - 1,
      },
    };

    try {
      const result = await this.connection.sendRequest<Location | Location[] | LocationLink[] | null>(
        'textDocument/definition',
        params
      );

      if (!result) return null;

      if (Array.isArray(result)) {
        return result.map((loc) => this.toMonacoLocation(loc));
      }

      return this.toMonacoLocation(result);
    } catch (error) {
      console.error('[lightweight-client] Definition request failed:', error);
      return null;
    }
  }

  /**
   * Convert LSP Location or LocationLink to Monaco Location
   */
  private toMonacoLocation(
    location: Location | LocationLink
  ): monaco.languages.Location {
    // Check if it's a LocationLink
    if ('targetUri' in location) {
      return {
        uri: this.monacoInstance.Uri.parse(location.targetUri),
        range: {
          startLineNumber: location.targetRange.start.line + 1,
          startColumn: location.targetRange.start.character + 1,
          endLineNumber: location.targetRange.end.line + 1,
          endColumn: location.targetRange.end.character + 1,
        },
      };
    }

    // It's a Location
    return {
      uri: this.monacoInstance.Uri.parse(location.uri),
      range: {
        startLineNumber: location.range.start.line + 1,
        startColumn: location.range.start.character + 1,
        endLineNumber: location.range.end.line + 1,
        endColumn: location.range.end.character + 1,
      },
    };
  }
}
