import type { FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '../errors/app-error.js';
import { loadConfig, type EnvironmentConfig } from '../config/env.js';
import { hasSessionCookie as checkSessionCookie } from '../modules/auth/session-cookies.js';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function createCsrfProtection(overrideConfig?: EnvironmentConfig) {
  return async function csrfProtectionHook(request: FastifyRequest, _reply: FastifyReply) {
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

    const config: EnvironmentConfig = overrideConfig || (request.server as any)?.froseConfig || loadConfig();
    const origin = request.headers.origin || request.headers.referer;
    const hasSessionCookie = checkSessionCookie(request.cookies, request.headers.cookie, config.NODE_ENV);

    // If request has no browser indicators (Origin, Referer, or session cookies),
    // it is a non-browser machine-to-machine / CLI call.
    if (!origin && !hasSessionCookie) {
      return;
    }

    // 1. Origin verification
    if (origin) {
      let parsedOrigin: URL;
      try {
        parsedOrigin = new URL(origin);
      } catch {
        throw AppError.forbidden('CSRF validation failed: Malformed Origin header', 'CSRF_VALIDATION_FAILED');
      }

      const originHostname = parsedOrigin.hostname.toLowerCase();
      const originHost = parsedOrigin.host.toLowerCase();

      // Localhost / LAN allowed ONLY outside production with exact hostname comparison
      const isDevLocalOrigin =
        config.NODE_ENV !== 'production' &&
        (originHostname === 'localhost' ||
          originHostname === '127.0.0.1' ||
          /^192\.168\.\d{1,3}\.\d{1,3}$/.test(originHostname));

      const allowedOrigins = Array.isArray(config.CORS_ORIGIN)
        ? config.CORS_ORIGIN
        : typeof config.CORS_ORIGIN === 'string'
          ? (config.CORS_ORIGIN as string).split(',')
          : [];

      const isAllowedConfigOrigin = allowedOrigins.some((pattern: string) => {
        const trimmed = pattern.trim();
        if (!trimmed) return false;
        if (trimmed === '*') {
          // Reject wildcard CORS_ORIGIN in production
          return config.NODE_ENV !== 'production';
        }
        try {
          const parsedAllowed = new URL(trimmed);
          return parsedAllowed.host.toLowerCase() === originHost && parsedAllowed.protocol === parsedOrigin.protocol;
        } catch {
          return trimmed.toLowerCase() === originHost;
        }
      });

      if (!isDevLocalOrigin && !isAllowedConfigOrigin) {
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
  };
}

export const csrfProtection = createCsrfProtection();
