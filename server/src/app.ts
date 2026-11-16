import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { loadConfig, EnvironmentConfig } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { AppError } from './errors/app-error.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { deviceRoutes } from './modules/devices/device.routes.js';
import type { HealthCheckResponse } from '../../shared/types/index.js';

export interface BuildAppOptions {
  config?: EnvironmentConfig;
  logger?: boolean;
  rateLimitMax?: number;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config || loadConfig();

  const app = fastify({
    logger: options.logger ?? false,
    disableRequestLogging: config.NODE_ENV === 'test',
  });

  // Request Duration Timing (X-Response-Time Header)
  app.addHook('onRequest', async (req, _reply) => {
    (req as any).startTime = process.hrtime();
  });

  app.addHook('onSend', async (req, reply, payload) => {
    if ((req as any).startTime) {
      const diff = process.hrtime((req as any).startTime);
      const timeMs = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);
      reply.header('X-Response-Time', `${timeMs}ms`);
    }
    return payload;
  });

  // CORS Configuration
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (
        config.CORS_ORIGIN.includes('*') ||
        config.CORS_ORIGIN.some((allowed) => allowed === origin || allowed === '*')
      ) {
        return cb(null, true);
      }
      return cb(null, true);
    },
    credentials: true,
  });

  // Cookie Plugin
  await app.register(cookie, {
    secret: config.JWT_SECRET,
  });

  // Rate Limiting Plugin (100 requests per minute by default, configurable for tests)
  await app.register(rateLimit, {
    max: options.rateLimitMax ?? 100,
    timeWindow: '1 minute',
  });

  // WebSockets Plugin
  await app.register(fastifyWebsocket, {
    options: {
      maxPayload: 1048576, // 1MB max payload
    },
  });

  // Global Error Handlers (RFC 7807)
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  // Serve PWA Client Static Files
  const clientDir = path.resolve(process.cwd(), 'client');
  try {
    await app.register(fastifyStatic, {
      root: clientDir,
      prefix: '/',
      decorateReply: false,
    });
  } catch {
    // Ignore static serving error in test environments if directory missing
  }

  // Health Check Endpoint
  app.get('/health', async (_request, reply) => {
    const response: HealthCheckResponse & { uptime: number; environment: string } = {
      status: 'ok',
      service: 'frose-street',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.NODE_ENV,
      portals: {
        billing: '/billing',
        packaging: '/packaging',
        kitchen: '/kitchen',
      },
    };
    return reply.status(200).send(response);
  });

  // Portal routing aliases
  app.get('/billing', async (_req, reply) => {
    return reply.status(200).send({
      portal: 'billing',
      status: 'ready',
      message: 'FROSE Street Billing Portal',
    });
  });

  app.get('/packaging', async (_req, reply) => {
    return reply.status(200).send({
      portal: 'packaging',
      status: 'ready',
      message: 'FROSE Street Packaging & Serving Portal',
    });
  });

  app.get('/kitchen', async (_req, reply) => {
    return reply.status(200).send({
      portal: 'kitchen',
      status: 'ready',
      message: 'FROSE Street Kitchen Display Portal',
    });
  });

  // Phase 5: Authentication Routes (/api/v1/auth)
  await app.register(authRoutes, { prefix: '/api/v1/auth' });

  // Phase 6: Device Pairing Routes (/api/v1/devices)
  await app.register(deviceRoutes, { prefix: '/api/v1/devices' });

  // Test-only endpoint for verifying error handler
  if (config.NODE_ENV === 'test') {
    app.get('/test/custom-error', async () => {
      throw AppError.forbidden('Custom forbidden test error', 'AUTH_FORBIDDEN');
    });

    app.get('/test/unhandled-error', async () => {
      throw new Error('Explosive unhandled error');
    });
  }

  return app;
}
