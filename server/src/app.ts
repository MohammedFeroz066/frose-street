import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { loadConfig, EnvironmentConfig } from './config/env.js';
import type { HealthCheckResponse } from '../../shared/types/index.js';

export interface BuildAppOptions {
  config?: EnvironmentConfig;
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config || loadConfig();

  const app = fastify({
    logger: options.logger ?? false,
    disableRequestLogging: config.NODE_ENV === 'test',
  });

  // CORS configuration
  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (like mobile apps, curl, postman)
      if (!origin) return cb(null, true);
      if (
        config.CORS_ORIGIN.includes('*') ||
        config.CORS_ORIGIN.some((allowed) => allowed === origin || allowed === '*')
      ) {
        return cb(null, true);
      }
      return cb(null, true); // Dev-friendly fallback
    },
    credentials: true,
  });

  // Cookie plugin
  await app.register(cookie, {
    secret: config.JWT_SECRET,
  });

  // Serve PWA client files
  const clientDir = path.resolve(process.cwd(), 'apps/street/client');
  try {
    await app.register(fastifyStatic, {
      root: clientDir,
      prefix: '/',
      decorateReply: false,
    });
  } catch (err) {
    // If running directly from apps/street folder
    const fallbackClientDir = path.resolve(process.cwd(), 'client');
    try {
      await app.register(fastifyStatic, {
        root: fallbackClientDir,
        prefix: '/',
        decorateReply: false,
      });
    } catch {
      // Ignore static serving if client dir not found in test mode
    }
  }

  // Health check endpoint
  app.get('/health', async (_request, reply) => {
    const response: HealthCheckResponse = {
      status: 'ok',
      service: 'frose-street',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
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

  return app;
}
