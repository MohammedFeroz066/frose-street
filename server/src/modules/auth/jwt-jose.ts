import {
  SignJWT,
  jwtVerify,
  importPKCS8,
  importSPKI,
  type JWTPayload,
} from 'jose';
import type { StaffRole, BackendEdition } from '../../../../shared/types/index.js';
import { AppError } from '../../errors/app-error.js';

export interface AuthTokenPayload extends JWTPayload {
  sub: string; // vendor_id
  phone: string;
  businessName: string;
  role: StaffRole;
  edition: BackendEdition;
  staffId?: string;
  deviceId?: string;
}

export interface JwtKeyRotationConfig {
  currentSecret: string;
  currentKid: string;
  previousSecret?: string;
  previousKid?: string;
}

export interface OfflineLicensePayload {
  vendorId: string;
  businessName: string;
  plan: 'cloud' | 'local';
  periodStart: string;
  periodEnd: string;
  status: 'active' | 'expired';
}

const DEFAULT_JWT_SECRET = 'frose-street-default-jwt-secret-dev-2026-change-in-prod-xyz';

/**
 * Validates and constructs JWT Key Rotation configuration from environment.
 * Enforces secret length >= 32 bytes and rejects default dev secret in production.
 */
export function getJwtKeyRotationConfig(env: {
  JWT_SECRET?: string;
  JWT_SECRET_PREVIOUS?: string;
  JWT_KID_CURRENT?: string;
  JWT_KID_PREVIOUS?: string;
}): JwtKeyRotationConfig {
  const currentSecret = env.JWT_SECRET || '';

  if (!currentSecret || currentSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 bytes long for secure HS256 operations.');
  }

  if (currentSecret === DEFAULT_JWT_SECRET) {
    throw new Error('JWT_SECRET cannot use the default placeholder secret. Please provide a strong secret.');
  }

  const previousSecret = env.JWT_SECRET_PREVIOUS;
  if (previousSecret && previousSecret.length < 32) {
    throw new Error('JWT_SECRET_PREVIOUS must be at least 32 bytes long if provided.');
  }

  return {
    currentSecret,
    currentKid: env.JWT_KID_CURRENT || 'k1',
    previousSecret: previousSecret || undefined,
    previousKid: env.JWT_KID_PREVIOUS || (previousSecret ? 'k0' : undefined),
  };
}

/**
 * Signs an access token using jose with pinned HS256 algorithm and kid header.
 * Default expiration is 15 minutes (900 seconds) for short-lived access tokens.
 */
export async function signJoseAccessToken(
  payload: Omit<AuthTokenPayload, 'iat' | 'exp'>,
  config: JwtKeyRotationConfig,
  expiresInSeconds: number = 900
): Promise<string> {
  const secretKey = new TextEncoder().encode(config.currentSecret);

  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT', kid: config.currentKid })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
    .sign(secretKey);
}

/**
 * Verifies an access token with strictly pinned HS256 algorithm (no algorithm negotiation).
 * Dynamically resolves current vs previous key via `kid` in the protected header.
 */
export async function verifyJoseAccessToken(
  token: string,
  config: JwtKeyRotationConfig
): Promise<AuthTokenPayload> {
  const { payload } = await jwtVerify(
    token,
    async (header) => {
      if (header.alg !== 'HS256') {
        throw new Error(`Algorithm ${header.alg} is not permitted. Pinned to HS256.`);
      }

      // Check kid matching current vs previous
      if (config.previousSecret && header.kid && header.kid === config.previousKid) {
        return new TextEncoder().encode(config.previousSecret);
      }

      return new TextEncoder().encode(config.currentSecret);
    },
    {
      algorithms: ['HS256'],
    }
  );

  return payload as unknown as AuthTokenPayload;
}

/**
 * Generates an offline license token using EdDSA (Ed25519).
 * The server signs using the private key from environment.
 */
export async function generateEd25519LicenseToken(
  payload: OfflineLicensePayload,
  privateKeyPem: string
): Promise<string> {
  const privateKey = await importPKCS8(privateKeyPem, 'EdDSA');

  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
    .setIssuedAt()
    .sign(privateKey);
}

/**
 * Verifies an offline license token using EdDSA (Ed25519).
 * Client / Offline verification requires ONLY the public key.
 */
export async function verifyEd25519LicenseToken(
  token: string,
  publicKeyPem: string
): Promise<{ valid: boolean; payload?: OfflineLicensePayload; reason?: string }> {
  try {
    const publicKey = await importSPKI(publicKeyPem, 'EdDSA');
    const { payload } = await jwtVerify(token, publicKey, {
      algorithms: ['EdDSA'],
    });

    return {
      valid: true,
      payload: payload as unknown as OfflineLicensePayload,
    };
  } catch (err: any) {
    return {
      valid: false,
      reason: err.message || 'License verification failed',
    };
  }
}
