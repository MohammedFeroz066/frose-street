import fastify, { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { loadConfig, isOriginAllowed, EnvironmentConfig } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { createCsrfProtection } from './middleware/csrf.js';
import { AppError } from './errors/app-error.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { deviceRoutes } from './modules/devices/device.routes.js';
import { menuRoutes } from './modules/menu/menu.routes.js';
import { orderRoutes } from './modules/orders/order.routes.js';
import { websocketRoutes, handleWsConnection, httpWsFallback, verifyWsUpgrade } from './modules/websocket/websocket.routes.js';
import { gallaRoutes } from './modules/galla/galla.routes.js';
import { paymentRoutes } from './modules/payments/payment.routes.js';
import { subscriptionRoutes } from './modules/subscriptions/subscription.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import type { HealthCheckResponse } from '../../shared/types/index.js';

export interface BuildAppOptions {
  config?: EnvironmentConfig;
  logger?: boolean;
  rateLimitMax?: number;
}

declare module 'fastify' {
  interface FastifyInstance {
    froseConfig?: EnvironmentConfig;
  }
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config || loadConfig();

  const app = fastify({
    logger: options.logger ?? false,
    disableRequestLogging: config.NODE_ENV === 'test',
  });

  app.decorate('froseConfig', config);

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

  // CORS Configuration (Strict exact-origin allowlist)
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (isOriginAllowed(origin, config)) {
        return cb(null, true);
      }
      return cb(null, false);
    },
    credentials: true,
  });

  // Cookie Plugin
  await app.register(cookie, {
    secret: config.JWT_SECRET,
  });

  // Security Headers & Enforced Strict CSP (@fastify/helmet)
  await app.register(helmet, {
    contentSecurityPolicy: {
      reportOnly: false,
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://api.qrserver.com'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        ...(config.NODE_ENV === 'production' ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: config.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
    crossOriginEmbedderPolicy: false,
  });

  // Rate Limiting Plugin (100 requests per minute on API routes; static assets excluded)
  const STATIC_ASSET_REGEX = /\.(?:html|js|mjs|css|webp|png|jpe?g|svg|gif|ico|woff2?|ttf|eot|json|webmanifest)$/i;
  const HTML_PORTAL_PATHS = new Set(['/', '/billing', '/packaging', '/kitchen', '/register', '/menu-setup', '/admin', '/login']);
  await app.register(rateLimit, {
    max: options.rateLimitMax ?? 100,
    timeWindow: '1 minute',
    allowList: (req) => {
      const urlPath = (req.url || '/').split('?')[0] || '/';
      if (urlPath.startsWith('/api/')) return false;
      if (STATIC_ASSET_REGEX.test(urlPath) || urlPath === '/favicon.ico') return true;
      const accept = String(req.headers.accept || '');
      return HTML_PORTAL_PATHS.has(urlPath) && accept.includes('text/html');
    },
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

  // Anti-CSRF Origin and Custom Header Verification Hook
  app.addHook('preHandler', createCsrfProtection(config));

  // Serve PWA Client Static Files
  const clientDir = path.resolve(process.cwd(), 'client');
  try {
    await app.register(fastifyStatic, {
      root: clientDir,
      prefix: '/',
      decorateReply: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        }
      },
    });
  } catch {
    // Ignore static serving error in test environments if directory missing
  }

  // Favicon Route (Prevents 404 clutter in mobile browsers)
  app.get('/favicon.ico', async (_request, reply) => {
    return reply.status(204).send();
  });

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
  app.get('/billing', async (req, reply) => {
    const accept = req.headers.accept || '';
    if (accept.includes('text/html')) {
      const billingPath = path.resolve(process.cwd(), 'client/billing.html');
      if (fs.existsSync(billingPath)) {
        reply.type('text/html');
        return reply.send(fs.readFileSync(billingPath, 'utf8'));
      }
    }
    return reply.status(200).send({
      portal: 'billing',
      status: 'ready',
      message: 'FROSE Street Billing Portal',
    });
  });

  app.get('/packaging', async (req, reply) => {
    const accept = req.headers.accept || '';
    if (accept.includes('text/html')) {
      const packagingPath = path.resolve(process.cwd(), 'client/packaging.html');
      if (fs.existsSync(packagingPath)) {
        reply.type('text/html');
        return reply.send(fs.readFileSync(packagingPath, 'utf8'));
      }
    }
    return reply.status(200).send({
      portal: 'packaging',
      status: 'ready',
      message: 'FROSE Street Packaging & Serving Portal',
    });
  });

  app.get('/kitchen', async (req, reply) => {
    const accept = req.headers.accept || '';
    if (accept.includes('text/html')) {
      const kitchenPath = path.resolve(process.cwd(), 'client/kitchen.html');
      if (fs.existsSync(kitchenPath)) {
        reply.type('text/html');
        return reply.send(fs.readFileSync(kitchenPath, 'utf8'));
      }
    }
    return reply.status(200).send({
      portal: 'kitchen',
      status: 'ready',
      message: 'FROSE Street Kitchen Display Portal',
    });
  });

  // Registration & Onboarding Page Route
  app.get('/register', async (_req, reply) => {
    const registerPath = path.resolve(process.cwd(), 'client/register.html');
    if (fs.existsSync(registerPath)) {
      reply.type('text/html');
      return reply.send(fs.readFileSync(registerPath, 'utf8'));
    }
    return reply.status(404).send({ error: 'Register page not found' });
  });

  // Menu & Inventory Configuration Portal Route
  app.get('/menu-setup', async (_req, reply) => {
    const menuSetupPath = path.resolve(process.cwd(), 'client/menu-setup.html');
    if (fs.existsSync(menuSetupPath)) {
      reply.type('text/html');
      return reply.send(fs.readFileSync(menuSetupPath, 'utf8'));
    }
    return reply.status(404).send({ error: 'Menu setup page not found' });
  });

  // Super Admin Portal Route
  app.get('/admin', async (_req, reply) => {
    const adminPath = path.resolve(process.cwd(), 'client/admin.html');
    if (fs.existsSync(adminPath)) {
      reply.type('text/html');
      return reply.send(fs.readFileSync(adminPath, 'utf8'));
    }
    return reply.status(404).send({ error: 'Super Admin page not found' });
  });

  // Login Page Route
  app.get('/login', async (_req, reply) => {
    const loginPath = path.resolve(process.cwd(), 'client/login.html');
    if (fs.existsSync(loginPath)) {
      reply.type('text/html');
      return reply.send(fs.readFileSync(loginPath, 'utf8'));
    }
    const registerPath = path.resolve(process.cwd(), 'client/register.html');
    if (fs.existsSync(registerPath)) {
      reply.type('text/html');
      return reply.send(fs.readFileSync(registerPath, 'utf8'));
    }
    return reply.status(404).send({ error: 'Login page not found' });
  });

  // Phase 5: Authentication Routes (/api/v1/auth)
  await app.register(authRoutes, { prefix: '/api/v1/auth' });

  // Phase 6: Device Pairing Routes (/api/v1/devices)
  await app.register(deviceRoutes, { prefix: '/api/v1/devices' });

  // Phase 7: Menu Management Routes (/api/v1/menu)
  await app.register(menuRoutes, { prefix: '/api/v1/menu' });

  // Phase 8: Order & Token Engine Routes (/api/v1/orders)
  await app.register(orderRoutes, { prefix: '/api/v1/orders' });

  // Phase 9: Real-Time WebSocket Routes (/api/v1/ws and alias /ws)
  await app.register(websocketRoutes, { prefix: '/api/v1/ws' });
  app.route({
    method: 'GET',
    url: '/ws',
    preValidation: [verifyWsUpgrade],
    wsHandler: handleWsConnection,
    handler: httpWsFallback,
  });

  // Phase 10: Daily Galla, Expenses & Z-Report Routes (/api/v1/galla)
  await app.register(gallaRoutes, { prefix: '/api/v1/galla' });

  // Phase 16: UPI Dynamic QR & Payment Flow Routes (/api/v1/payments)
  await app.register(paymentRoutes, { prefix: '/api/v1/payments' });

  // Phase 18: Subscription, SaaS Licensing & Renewal Routes (/api/v1/subscriptions)
  await app.register(subscriptionRoutes, { prefix: '/api/v1/subscriptions' });

  // Phase 21: Super Admin Multi-Restaurant Management Routes (/api/v1/admin)
  await app.register(adminRoutes, { prefix: '/api/v1/admin' });

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
