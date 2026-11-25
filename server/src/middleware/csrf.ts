import type { FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '../errors/app-error.js';
import { loadConfig } from '../config/env.js';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function csrfProtection(request: FastifyRequest, _reply: FastifyReply) {
  if (!STATE_CHANGING_METHODS.has(request.method.toUpperCase())) {
    return;
  }

  // Bypass for WebSocket upgrade, health routes, or third-party server-to-server webhooks
  if (
    request.url === '/health' ||
    request.url.startsWith('/ws') ||
    request.url.startsWith('/api/v1/payments/webhook')
  ) {
    return;
  }

  const origin = request.headers.origin || request.headers.referer;
  const hasSessionCookie = Boolean(
    request.cookies?.frose_access_token ||
    request.cookies?.frose_refresh_token ||
    (request.headers.cookie && request.headers.cookie.includes('frose_'))
  );

  // If request has no browser indicators (Origin, Referer, or session cookies),
  // it is a non-browser machine-to-machine / CLI call.
  if (!origin && !hasSessionCookie) {
    return;
  }

  const config = loadConfig();

  // 1. Origin verification
  if (origin) {
    let originHost = '';
    try {
      originHost = new URL(origin).host;
    } catch {
      throw AppError.forbidden('CSRF validation failed: Malformed Origin header', 'CSRF_VALIDATION_FAILED');
    }

    const isLocalhost = originHost.startsWith('localhost') || originHost.startsWith('127.0.0.1') || originHost.startsWith('192.168.');
    const allowedOrigins = Array.isArray(config.CORS_ORIGIN)
      ? config.CORS_ORIGIN
      : typeof config.CORS_ORIGIN === 'string'
        ? (config.CORS_ORIGIN as string).split(',')
        : [];

    const isAllowedConfigOrigin = allowedOrigins.some((pattern) => {
      const trimmed = pattern.trim();
      if (trimmed === '*') return true;
      try {
        return new URL(trimmed).host === originHost;
      } catch {
        return trimmed === originHost;
      }
    });

    if (!isLocalhost && !isAllowedConfigOrigin) {
      throw AppError.forbidden(
        `CSRF validation failed: Untrusted Origin "${originHost}"`,
        'CSRF_VALIDATION_FAILED'
      );
    }
  }

  // 2. Custom header verification (browsers cannot send custom headers on simple cross-site requests)
  const hasCustomHeader =
    request.headers['x-frose-csrf'] ||
    request.headers['x-requested-with'] ||
    request.headers['authorization'];

  if (!hasCustomHeader) {
    throw AppError.forbidden(
      'CSRF validation failed: Missing required anti-CSRF custom header (e.g. X-FROSE-CSRF: 1)',
      'CSRF_VALIDATION_FAILED'
    );
  }
}
