import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { OrderService } from '../../server/src/modules/orders/order.service.js';
import { getDatabase } from '../../server/src/db/database.js';

function openRawWebSocket(
  port: number,
  wsPath: string,
  headers: Record<string, string> = {},
): Promise<{
  statusCode: number;
  messages: any[];
  closed: boolean;
  closeCode?: number;
  socket: any;
}> {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: wsPath,
      method: 'GET',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': key,
        ...headers,
      },
    });

    req.on('response', (res) => {
      resolve({
        statusCode: res.statusCode || 0,
        messages: [],
        closed: true,
        socket: null,
      });
    });

    req.on('upgrade', (_res, socket, head) => {
      const messages: any[] = [];
      let closed = false;
      let closeCode: number | undefined;
      let buf = Buffer.alloc(0);

      const parseFrames = (chunk: Buffer) => {
        buf = Buffer.concat([buf, chunk]);
        while (buf.length >= 2) {
          const opcode = buf[0]! & 0x0f;
          let payloadLen = buf[1]! & 0x7f;
          let offset = 2;
          if (payloadLen === 126) {
            if (buf.length < 4) break;
            payloadLen = buf.readUInt16BE(2);
            offset = 4;
          } else if (payloadLen === 127) {
            break;
          }
          if (buf.length < offset + payloadLen) break;
          const payload = buf.subarray(offset, offset + payloadLen);
          buf = buf.subarray(offset + payloadLen);

          if (opcode === 0x01) {
            try {
              messages.push(JSON.parse(payload.toString('utf8')));
            } catch {
              messages.push(payload.toString('utf8'));
            }
          } else if (opcode === 0x08) {
            closed = true;
            if (payload.length >= 2) closeCode = payload.readUInt16BE(0);
          }
        }
      };

      if (head && head.length > 0) parseFrames(head);
      socket.on('data', parseFrames);
      socket.on('close', () => {
        closed = true;
      });

      setTimeout(() => {
        resolve({
          statusCode: 101,
          messages,
          closed,
          closeCode,
          socket,
        });
      }, 150);
    });

    req.on('error', reject);
    req.end();
  });
}

describe('SEC-07: WebSocket Cookie Auth, Strict Origin Check & No ?token=', () => {
  let app: FastifyInstance;
  let port: number;
  let cookieVendorA = '';
  let vendorAId = '';
  let cookieVendorB = '';
  let vendorBId = '';

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'true';
    app = await buildApp({ logger: false });
    await app.ready();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address() as { port: number };
    port = addr.port;

    const regA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { phone: '9811100001', businessName: 'WS Stall A', password: 'ValidPassphraseA' },
    });
    vendorAId = regA.json().vendor.id;
    const cA = regA.cookies.find((c) => c.name === 'frose_access_token');
    cookieVendorA = `${cA?.name}=${cA?.value}`;

    const regB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { phone: '9811100002', businessName: 'WS Stall B', password: 'ValidPassphraseB' },
    });
    vendorBId = regB.json().vendor.id;
    const cB = regB.cookies.find((c) => c.name === 'frose_access_token');
    cookieVendorB = `${cB?.name}=${cB?.value}`;
  });

  afterAll(async () => {
    for (const c of (app as any).websocketServer?.clients || []) {
      try { c.terminate(); } catch {}
    }
    app.server?.closeAllConnections?.();
    await app.close();
  });

  it('a) rejects cross-site Origin WebSocket upgrades', async () => {
    const res = await openRawWebSocket(port, '/ws', {
      Origin: 'https://evil.attacker.com',
      Cookie: cookieVendorA,
    });
    expect(res.statusCode !== 101 || res.closed).toBe(true);
    res.socket?.destroy();
  });

  it('b) rejects ?token= query auth and unauthenticated WebSocket connections immediately', async () => {
    const rawJwt = cookieVendorA.split('=')[1];
    const queryTokenRes = await openRawWebSocket(port, `/ws?token=${encodeURIComponent(rawJwt!)}`, {
      Origin: `http://127.0.0.1:${port}`,
    });
    expect(queryTokenRes.statusCode !== 101 || queryTokenRes.closed).toBe(true);
    expect(queryTokenRes.messages.some((m) => m.event === 'authenticated')).toBe(false);
    queryTokenRes.socket?.destroy();

    const noAuthRes = await openRawWebSocket(port, '/ws', {
      Origin: `http://127.0.0.1:${port}`,
    });
    expect(noAuthRes.statusCode !== 101 || noAuthRes.closed).toBe(true);
    expect(noAuthRes.messages.some((m) => m.event === 'auth:required')).toBe(false);
    noAuthRes.socket?.destroy();
  });

  it('c) authenticates via HttpOnly cookie, joins only own tenant room, and isolates order broadcasts', async () => {
    const connA = await openRawWebSocket(port, '/ws', {
      Origin: `http://127.0.0.1:${port}`,
      Cookie: cookieVendorA,
    });
    const connB = await openRawWebSocket(port, '/ws', {
      Origin: `http://127.0.0.1:${port}`,
      Cookie: cookieVendorB,
    });

    expect(connA.statusCode).toBe(101);
    expect(connA.closed).toBe(false);
    expect(connA.messages.some((m) => m.event === 'authenticated' && m.data?.vendorId === vendorAId)).toBe(true);

    expect(connB.statusCode).toBe(101);
    expect(connB.closed).toBe(false);
    expect(connB.messages.some((m) => m.event === 'authenticated' && m.data?.vendorId === vendorBId)).toBe(true);

    const db = getDatabase();
    await OrderService.createOrder(db, vendorAId, {
      items: [{ menuItemId: 'def-1', quantity: 1 }],
      paymentMethod: 'cash',
    });

    await new Promise((r) => setTimeout(r, 80));
    expect(connA.messages.some((m) => m.event === 'order:new')).toBe(true);
    expect(connB.messages.some((m) => m.event === 'order:new')).toBe(false);

    connA.socket?.destroy();
    connB.socket?.destroy();
  });

  it('client kitchen.js and packaging.js do not append ?token= to WebSocket URLs and server/src no longer imports jwt.ts', () => {
    const kitchenJs = fs.readFileSync(path.resolve(__dirname, '../../client/js/kitchen.js'), 'utf8');
    const packagingJs = fs.readFileSync(path.resolve(__dirname, '../../client/js/packaging.js'), 'utf8');
    expect(kitchenJs).not.toContain('?token=');
    expect(packagingJs).not.toContain('?token=');

    const wsRoutesTs = fs.readFileSync(
      path.resolve(__dirname, '../../server/src/modules/websocket/websocket.routes.ts'),
      'utf8',
    );
    expect(wsRoutesTs).not.toMatch(/from\s+['"]\.\.\/auth\/jwt\.js['"]/);
  });
});
