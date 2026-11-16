import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyJwt, AuthTokenPayload } from '../modules/auth/jwt.js';
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
  const config = loadConfig();

  // 1. Check HttpOnly cookie
  let token = request.cookies?.frose_street_token;

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
    const payload = verifyJwt(token, config.JWT_SECRET);
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
