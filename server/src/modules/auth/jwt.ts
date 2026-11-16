import crypto from 'node:crypto';
import type { StaffRole, BackendEdition } from '../../../../shared/types/index.js';

export interface AuthTokenPayload {
  sub: string; // vendor_id
  phone: string;
  businessName: string;
  role: StaffRole;
  edition: BackendEdition;
  staffId?: string;
  deviceId?: string;
  iat?: number;
  exp?: number;
}

/**
 * Lightweight, zero-dependency HS256 JWT implementation
 */
export function signJwt(payload: Omit<AuthTokenPayload, 'iat' | 'exp'>, secret: string, expiresInSeconds: number = 30 * 86400): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: AuthTokenPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');

  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyJwt(token: string, secret: string): AuthTokenPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT');
  }

  const [encodedHeader, encodedPayload, signature] = parts;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  const sigBuffer = Buffer.from(signature);
  const expBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expBuffer.length || !crypto.timingSafeEqual(sigBuffer, expBuffer)) {
    throw new Error('Invalid JWT signature');
  }

  const payload: AuthTokenPayload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  const now = Math.floor(Date.now() / 1000);

  if (payload.exp && payload.exp < now) {
    throw new Error('JWT token expired');
  }

  return payload;
}
