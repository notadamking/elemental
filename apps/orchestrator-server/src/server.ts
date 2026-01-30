/**
 * Server Startup
 *
 * Cross-runtime server initialization for Bun and Node.js.
 */

import type { Hono } from 'hono';
import { PORT, HOST } from './config.js';
import type { Services } from './services.js';
import type { ServerWebSocket, WSClientData } from './types.js';
import { handleWSOpen, handleWSMessage, handleWSClose } from './websocket.js';

const isBun = typeof globalThis.Bun !== 'undefined';

export function startServer(app: Hono, services: Services): void {
  if (isBun) {
    startBunServer(app, services);
  } else {
    startNodeServer(app, services);
  }
}

function startBunServer(app: Hono, services: Services): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Bun = (globalThis as any).Bun;
  const server = Bun.serve({
    port: PORT,
    hostname: HOST,
    fetch: app.fetch,
    websocket: {
      open(ws: ServerWebSocket<WSClientData>) {
        handleWSOpen(ws);
      },
      message(ws: ServerWebSocket<WSClientData>, message: string | Buffer) {
        handleWSMessage(ws, message, services);
      },
      close(ws: ServerWebSocket<WSClientData>) {
        handleWSClose(ws);
      },
    },
  });

  app.get('/ws', (c) => {
    const upgraded = server.upgrade(c.req.raw, { data: { id: '' } });
    return upgraded ? new Response(null, { status: 101 }) : c.json({ error: 'WebSocket upgrade failed' }, 400);
  });

  console.log(`[orchestrator] Server running at http://${HOST}:${PORT} (Bun)`);
  console.log(`[orchestrator] WebSocket available at ws://${HOST}:${PORT}/ws`);
}

function startNodeServer(app: Hono, services: Services): void {
  import('ws').then(({ WebSocketServer }) => {
    import('http').then(({ createServer }) => {
      const httpServer = createServer(async (req, res) => {
        const url = `http://${HOST}:${PORT}${req.url}`;
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
        }

        let body: string | undefined;
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          body = Buffer.concat(chunks).toString();
        }

        const request = new Request(url, { method: req.method, headers, body });
        const response = await app.fetch(request);

        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));

        if (response.body) {
          const reader = response.body.getReader();
          const pump = async (): Promise<void> => {
            try {
              const { done, value } = await reader.read();
              if (done) {
                res.end();
                return;
              }
              res.write(value);
              return pump();
            } catch {
              res.end();
            }
          };
          await pump();
        } else {
          res.end(await response.text());
        }
      });

      const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

      wss.on('connection', (ws) => {
        const wsData: WSClientData = {
          id: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        };

        const WS_OPEN = 1;
        const wsAdapter: ServerWebSocket<WSClientData> = {
          data: wsData,
          send: (data: string | ArrayBuffer) => {
            if (ws.readyState === WS_OPEN) {
              ws.send(typeof data === 'string' ? data : Buffer.from(data));
            }
          },
          close: () => ws.close(),
          readyState: ws.readyState,
        };

        handleWSOpen(wsAdapter);
        ws.on('message', (msg) => {
          (wsAdapter as { readyState: number }).readyState = ws.readyState;
          handleWSMessage(wsAdapter, msg.toString(), services);
        });
        ws.on('close', () => handleWSClose(wsAdapter));
      });

      httpServer.listen(PORT, HOST, () => {
        console.log(`[orchestrator] Server running at http://${HOST}:${PORT} (Node.js)`);
        console.log(`[orchestrator] WebSocket available at ws://${HOST}:${PORT}/ws`);
      });
    });
  });
}
