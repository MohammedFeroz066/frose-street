import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { WebSocketHub, ConnectedClient } from './websocket.hub.js';
import { verifyJwt } from '../auth/jwt.js';
import { requireAuth } from '../../middleware/auth.js';
import { loadConfig } from '../../config/env.js';

export const websocketRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const config = loadConfig();

  /**
   * WebSocket Connection Endpoint: /api/v1/ws
   * Connects Billing Counter, Kitchen Display, and Packaging Station
   */
  app.get('/ws', { websocket: true }, (connection, req) => {
    const socket = connection.socket;
    const query = req.query as any;

    // 1. Extract authentication token
    let token = query?.token;
    if (!token && req.cookies?.frose_street_token) {
      token = req.cookies.frose_street_token;
    }
    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
        token = parts[1];
      }
    }

    if (!token) {
      socket.send(
        JSON.stringify({
          event: 'error',
          data: { code: 'AUTH_REQUIRED', message: 'Token required to connect to real-time channel' },
          timestamp: new Date().toISOString(),
        }),
      );
      socket.close(4001, 'Unauthorized');
      return;
    }

    // 2. Verify JWT token
    let userPayload: any;
    try {
      userPayload = verifyJwt(token, config.JWT_SECRET);
    } catch (err: any) {
      socket.send(
        JSON.stringify({
          event: 'error',
          data: { code: 'INVALID_TOKEN', message: err.message || 'Invalid or expired session token' },
          timestamp: new Date().toISOString(),
        }),
      );
      socket.close(4001, 'Invalid Token');
      return;
    }

    // 3. Register client in WebSocket Hub
    const client: ConnectedClient = {
      socket,
      vendorId: userPayload.sub,
      role: userPayload.role,
      deviceId: userPayload.deviceId,
      connectedAt: new Date(),
      lastPing: Date.now(),
    };

    WebSocketHub.registerClient(client);

    // 4. Handle client messages (e.g. heartbeat ping/pong)
    socket.on('message', (rawMessage: any) => {
      try {
        const parsed = JSON.parse(rawMessage.toString());
        if (parsed.event === 'ping') {
          client.lastPing = Date.now();
          WebSocketHub.sendToClient(client, 'pong', { time: Date.now() });
        }
      } catch {
        // Ignore unparseable frames
      }
    });
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
