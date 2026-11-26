import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyJoseAccessToken, getJwtKeyRotationConfig, AuthTokenPayload } from '../modules/auth/jwt-jose.js';
import { readAccessTokenCookie } from '../modules/auth/session-cookies.js';
import { AppError } from '../errors/app-error.js';
import { loadConfig } from '../config/env.js';
import type { StaffRole } from '../../../shared/types/index.js';

// Extend FastifyRequest interface to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthTokenPayload;
  }
}

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply) {
  const config = (request.server as any)?.froseConfig || loadConfig();

  // 1. Check HttpOnly access cookie (__Host- prefixed in production)
  let token = readAccessTokenCookie(request.cookies, config.NODE_ENV);

  // 2. Check Authorization Bearer header if cookie not present
  if (!token && request.headers.authorization) {
    const parts = request.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      token = parts[1];
    }
  }

  if (!token) {
    throw AppError.unauthorized('Authentication required to access this portal', 'AUTH_REQUIRED');
  }

  try {
    let rotationConfig: any;
    try {
      rotationConfig = getJwtKeyRotationConfig(config);
    } catch {
      rotationConfig = {
        currentSecret: config.JWT_SECRET || 'dev-fallback-secret-at-least-32-chars-long-2026',
        currentKid: 'k1',
      };
    }

    const payload = await verifyJoseAccessToken(token, rotationConfig);
    request.user = payload;
  } catch (err: any) {
    throw AppError.unauthorized(err.message || 'Invalid or expired session token', 'INVALID_TOKEN');
  }
}

export function requireRole(...allowedRoles: StaffRole[]) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.user) {
      throw AppError.unauthorized('Authentication required', 'AUTH_REQUIRED');
    }

    if (!allowedRoles.includes(request.user.role)) {
      throw AppError.forbidden(
        `Role "${request.user.role}" does not have permission to access this resource`,
        'INSUFFICIENT_PERMISSIONS',
      );
    }
  };
}
