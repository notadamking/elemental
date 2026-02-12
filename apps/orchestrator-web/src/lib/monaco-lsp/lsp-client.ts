/**
 * LSP Client Module
 *
 * Manages WebSocket connections to language servers running on the orchestrator server.
 * Provides LSP features like autocompletion, hover, and diagnostics to Monaco editors.
 */

import { MonacoLanguageClient } from 'monaco-languageclient';
import {
  toSocket,
  WebSocketMessageReader,
  WebSocketMessageWriter,
} from 'vscode-ws-jsonrpc';

/**
 * LSP server status from the API
 */
export interface LspServerStatus {
  id: string;
  name: string;
  languages: string[];
  available: boolean;
  running: boolean;
}

/**
 * LSP status response from the API
 */
export interface LspStatusResponse {
  servers: LspServerStatus[];
  workspaceRoot: string;
}

/**
 * Active language client connection
 */
interface ActiveClient {
  client: MonacoLanguageClient;
  socket: WebSocket;
  language: string;
}

/**
 * Cached LSP status
 */
let cachedStatus: LspStatusResponse | null = null;
let statusFetchPromise: Promise<LspStatusResponse> | null = null;

/**
 * Map of active language clients by language ID
 */
const activeClients = new Map<string, ActiveClient>();

/**
 * Fetch LSP status from the server
 */
export async function fetchLspStatus(forceRefresh = false): Promise<LspStatusResponse> {
  if (cachedStatus && !forceRefresh) {
    return cachedStatus;
  }

  if (statusFetchPromise && !forceRefresh) {
    return statusFetchPromise;
  }

  statusFetchPromise = fetch('/api/lsp/status')
    .then((res) => {
      if (!res.ok) {
        throw new Error(`Failed to fetch LSP status: ${res.statusText}`);
      }
      return res.json();
    })
    .then((data) => {
      cachedStatus = data;
      statusFetchPromise = null;
      return data;
    })
    .catch((err) => {
      statusFetchPromise = null;
      throw err;
    });

  return statusFetchPromise;
}

/**
 * Check if a language has LSP support available
 */
export async function isLspAvailableForLanguage(languageId: string): Promise<boolean> {
  try {
    const status = await fetchLspStatus();
    const server = status.servers.find((s) => s.languages.includes(languageId));
    return server?.available ?? false;
  } catch {
    return false;
  }
}

/**
 * Get the WebSocket URL for LSP connections
 */
function getLspWebSocketUrl(language: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/ws/lsp?language=${encodeURIComponent(language)}`;
}

/**
 * Create WebSocket message transports for the language client
 */
function createWebSocketTransports(socket: WebSocket) {
  const reader = new WebSocketMessageReader(toSocket(socket));
  const writer = new WebSocketMessageWriter(toSocket(socket));
  return { reader, writer };
}

/**
 * Connect to a language server for a specific language
 */
export async function connectLsp(
  language: string,
  _monacoInstance?: typeof import('monaco-editor'),
  _documentUri?: string
): Promise<MonacoLanguageClient | null> {
  // Check if already connected
  if (activeClients.has(language)) {
    const existing = activeClients.get(language)!;
    if (existing.socket.readyState === WebSocket.OPEN) {
      console.log(`[lsp-client] Already connected to ${language} server`);
      return existing.client;
    }
    // Clean up stale connection
    await disconnectLsp(language);
  }

  // Check if server is available
  const available = await isLspAvailableForLanguage(language);
  if (!available) {
    console.log(`[lsp-client] No LSP server available for ${language}`);
    return null;
  }

  console.log(`[lsp-client] Connecting to ${language} language server...`);

  return new Promise((resolve, reject) => {
    const url = getLspWebSocketUrl(language);
    const socket = new WebSocket(url);

    socket.onopen = () => {
      console.log(`[lsp-client] WebSocket connected for ${language}`);

      try {
        const transports = createWebSocketTransports(socket);

        // Note: workspaceFolder requires a vscode-uri Uri type which isn't easily available
        // in a browser environment. The language server will use rootUri from initialization instead.
        const client = new MonacoLanguageClient({
          name: `${language} Language Client`,
          clientOptions: {
            documentSelector: [{ language }],
            // rootUri is set via the LSP initialize request by the server
          },
          messageTransports: transports,
        });

        client.start();

        activeClients.set(language, { client, socket, language });

        console.log(`[lsp-client] Language client started for ${language}`);
        resolve(client);
      } catch (error) {
        console.error(`[lsp-client] Error creating language client:`, error);
        socket.close();
        reject(error);
      }
    };

    socket.onerror = (error) => {
      console.error(`[lsp-client] WebSocket error for ${language}:`, error);
      reject(new Error(`WebSocket connection failed for ${language}`));
    };

    socket.onclose = (event) => {
      console.log(
        `[lsp-client] WebSocket closed for ${language}: code=${event.code}, reason=${event.reason}`
      );
      activeClients.delete(language);
    };
  });
}

/**
 * Disconnect from a language server
 */
export async function disconnectLsp(language: string): Promise<void> {
  const active = activeClients.get(language);
  if (!active) {
    return;
  }

  console.log(`[lsp-client] Disconnecting from ${language} server...`);

  try {
    await active.client.stop();
  } catch (error) {
    console.warn(`[lsp-client] Error stopping client for ${language}:`, error);
  }

  if (active.socket.readyState === WebSocket.OPEN) {
    active.socket.close();
  }

  activeClients.delete(language);
}

/**
 * Disconnect from all language servers
 */
export async function disconnectAllLsp(): Promise<void> {
  const languages = Array.from(activeClients.keys());
  await Promise.all(languages.map((lang) => disconnectLsp(lang)));
}

/**
 * Get the current connection state for a language
 */
export function getLspConnectionState(language: string): 'connected' | 'disconnected' {
  const active = activeClients.get(language);
  if (!active) {
    return 'disconnected';
  }
  return active.socket.readyState === WebSocket.OPEN ? 'connected' : 'disconnected';
}

/**
 * Get all connected languages
 */
export function getConnectedLanguages(): string[] {
  return Array.from(activeClients.keys()).filter(
    (lang) => getLspConnectionState(lang) === 'connected'
  );
}

/**
 * Clear the cached LSP status
 */
export function clearLspStatusCache(): void {
  cachedStatus = null;
}
