import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { WebSocketHub, ConnectedClient } from './websocket.hub.js';
import { requireAuth } from '../../middleware/auth.js';
import { isOriginAllowed, loadConfig, type EnvironmentConfig } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import { verifyJoseAccessToken, getJwtKeyRotationConfig } from '../auth/jwt-jose.js';
import { getSessionCookieNames, readAccessTokenCookie } from '../auth/session-cookies.js';

const WsQuerySchema = z.object({}).strict();

function resolveJwtConfig(config: EnvironmentConfig) {
  try {
    return getJwtKeyRotationConfig(config);
  } catch {
    return {
      currentSecret: config.JWT_SECRET || 'dev-fallback-secret-at-least-32-chars-long-2026',
      currentKid: 'k1',
    };
  }
}

function parseCookieHeaderValue(cookieHeader: string | undefined, cookieName: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    if (name === cookieName) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return undefined;
}

function validateOriginAndQuery(req: FastifyRequest, config: EnvironmentConfig): void {
  const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;

  if (config.NODE_ENV === 'production') {
    if (!originHeader || !isOriginAllowed(originHeader, config)) {
      throw AppError.forbidden('WebSocket upgrade rejected: Untrusted or missing Origin', 'WS_ORIGIN_FORBIDDEN');
    }
  } else if (originHeader && !isOriginAllowed(originHeader, config)) {
    throw AppError.forbidden('WebSocket upgrade rejected: Untrusted Origin', 'WS_ORIGIN_FORBIDDEN');
  }

  const queryCheck = WsQuerySchema.safeParse(req.query || {});
  if (!queryCheck.success || (req.url && req.url.includes('token='))) {
    throw AppError.unauthorized(
      'WebSocket query string authentication (?token=) is disabled; use HttpOnly session cookie',
      'WS_QUERY_TOKEN_REJECTED',
    );
  }
}

export const verifyWsUpgrade = async (request: FastifyRequest, _reply: FastifyReply) => {
  const config = request.server.froseConfig || loadConfig();
  validateOriginAndQuery(request, config);
};

export const handleWsConnection = (connection: any, req: FastifyRequest) => {
  const config = req.server?.froseConfig || loadConfig();
  const socket = connection.socket;

  // Enforce <= 5s handshake authentication ceiling
  const handshakeTimer = setTimeout(() => {
    try {
      socket.close(1008, 'WebSocket authentication handshake timeout');
    } catch {
      // Ignore close error on already-closed socket
    }
  }, 5000);

  let client: ConnectedClient | null = null;

  const rejectAndClose = (reason: string) => {
    clearTimeout(handshakeTimer);
    try {
      socket.close(1008, reason);
    } catch {
      // Ignore close error
    }
  };

  try {
    validateOriginAndQuery(req, config);
  } catch (err: any) {
    rejectAndClose(err?.message || 'WebSocket connection rejected');
    return;
  }

  const cookieNames = getSessionCookieNames(config.NODE_ENV);
  const accessToken =
    readAccessTokenCookie(req.cookies, config.NODE_ENV) ||
    parseCookieHeaderValue(req.headers.cookie, cookieNames.access);

  if (!accessToken) {
    rejectAndClose('Authentication required via HttpOnly session cookie');
    return;
  }

  const jwtConfig = resolveJwtConfig(config);
  let authenticated = false;

  void verifyJoseAccessToken(accessToken, jwtConfig)
    .then((userPayload) => {
      clearTimeout(handshakeTimer);
      authenticated = true;
      client = {
        socket,
        vendorId: userPayload.sub,
        role: userPayload.role,
        deviceId: userPayload.deviceId,
        connectedAt: new Date(),
        lastPing: Date.now(),
      };
      WebSocketHub.registerClient(client);
      socket.send(
        JSON.stringify({
          event: 'authenticated',
          data: { vendorId: client.vendorId, role: client.role },
          timestamp: new Date().toISOString(),
        }),
      );
    })
    .catch(() => {
      rejectAndClose('Invalid or expired session token');
    });

  socket.on('close', () => {
    clearTimeout(handshakeTimer);
  });

  // Handle authenticated client heartbeat ping/pong only
  socket.on('message', (rawMessage: any) => {
    if (!authenticated || !client) return;
    try {
      const parsed = JSON.parse(rawMessage.toString());
      if (parsed.event === 'ping') {
        client.lastPing = Date.now();
        socket.send(JSON.stringify({ event: 'pong', data: { time: Date.now() } }));
      }
    } catch {
      // Ignore unparseable frames
    }
  });
};

export const httpWsFallback = async (_request: any, reply: any) => {
  return reply.status(200).send({
    service: 'frose-websocket',
    status: 'ready',
    message: 'FROSE Street Real-Time WebSocket endpoint',
  });
};

export const websocketRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  /**
   * WebSocket Connection Endpoints: / and /ws
   * Connects Billing Counter, Kitchen Display, and Packaging Station via HttpOnly cookies
   */
  app.route({
    method: 'GET',
    url: '/',
    preValidation: [verifyWsUpgrade],
    wsHandler: handleWsConnection,
    handler: httpWsFallback,
  });
  app.route({
    method: 'GET',
    url: '/ws',
    preValidation: [verifyWsUpgrade],
    wsHandler: handleWsConnection,
    handler: httpWsFallback,
  });

  /**
   * GET /api/v1/ws/stats
   * Returns connection statistics for current vendor stall
   */
  app.get('/stats', { preHandler: [requireAuth] }, async (request, reply) => {
    const stats = WebSocketHub.getStats(request.user!.sub);
    return reply.status(200).send({
      status: 'success',
      vendorId: request.user!.sub,
      activeScreens: stats.stallClients,
    });
  });
};
