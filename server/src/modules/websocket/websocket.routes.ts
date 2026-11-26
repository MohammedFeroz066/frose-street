import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { WebSocketHub, ConnectedClient } from './websocket.hub.js';
import { verifyJwt } from '../auth/jwt.js';
import { requireAuth } from '../../middleware/auth.js';
import { loadConfig } from '../../config/env.js';

import { readAccessTokenCookie } from '../auth/session-cookies.js';

export const handleWsConnection = (connection: any, req: any) => {
  const config = loadConfig();
  const socket = connection.socket;
  const query = req.query as any;

  // 1. Extract authentication token
  let token = query?.token;
  if (!token) {
    token = readAccessTokenCookie(req.cookies, config.NODE_ENV);
  }
  if (!token && req.headers?.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      token = parts[1];
    }
  }

  let client: ConnectedClient | null = null;

  const authenticateAndRegister = (jwtToken: string) => {
    try {
      const userPayload = verifyJwt(jwtToken, config.JWT_SECRET);
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
      return true;
    } catch (err: any) {
      socket.send(
        JSON.stringify({
          event: 'error',
          data: { code: 'INVALID_TOKEN', message: err.message || 'Invalid or expired session token' },
          timestamp: new Date().toISOString(),
        }),
      );
      return false;
    }
  };

  if (token) {
    authenticateAndRegister(token);
  } else {
    // Allow unauthenticated connection to wait for auth message frame
    socket.send(
      JSON.stringify({
        event: 'auth:required',
        data: { message: 'Provide token via ?token=... or send { event: "auth", token }' },
        timestamp: new Date().toISOString(),
      }),
    );
  }

  // 4. Handle client messages (e.g. heartbeat ping/pong, dynamic auth)
  socket.on('message', (rawMessage: any) => {
    try {
      const parsed = JSON.parse(rawMessage.toString());
      if (parsed.event === 'ping') {
        if (client) client.lastPing = Date.now();
        socket.send(JSON.stringify({ event: 'pong', data: { time: Date.now() } }));
      } else if (parsed.event === 'auth' && parsed.token) {
        authenticateAndRegister(parsed.token);
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
   * Connects Billing Counter, Kitchen Display, and Packaging Station
   */
  app.route({
    method: 'GET',
    url: '/',
    wsHandler: handleWsConnection,
    handler: httpWsFallback,
  });
  app.route({
    method: 'GET',
    url: '/ws',
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
