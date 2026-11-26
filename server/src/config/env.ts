import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config();

export const DEFAULT_DEV_JWT_SECRET = 'frose-street-default-dev-secret-key-32chars';

export interface EnvironmentConfig {
  NODE_ENV: string;
  PORT: number;
  HOST: string;
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  CORS_ORIGIN: string[];
  CLIENT_DIR: string;
}

/**
 * Enforces production security checks to fail fast at startup:
 * - USE_MEMORY_DB cannot be true in production
 * - JWT_SECRET cannot be missing, under 32 chars, or equal to development default
 * - CORS_ORIGIN cannot be unset or empty
 */
export function validateProductionEnvironment(): void {
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv !== 'production') {
    return;
  }

  if (process.env.USE_MEMORY_DB === 'true') {
    throw new Error('FATAL SECURITY ERROR: USE_MEMORY_DB cannot be true in production');
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('FATAL SECURITY ERROR: JWT_SECRET is required in production');
  }

  if (jwtSecret.length < 32) {
    throw new Error('FATAL SECURITY ERROR: JWT_SECRET must be at least 32 characters long in production');
  }

  if (jwtSecret === DEFAULT_DEV_JWT_SECRET) {
    throw new Error('FATAL SECURITY ERROR: Default development JWT_SECRET cannot be used in production');
  }

  const corsOrigin = process.env.CORS_ORIGIN;
  if (!corsOrigin || corsOrigin.trim().length === 0) {
    throw new Error('FATAL SECURITY ERROR: CORS_ORIGIN must be explicitly configured in production');
  }
  if (corsOrigin.split(',').some((o) => o.trim() === '*')) {
    throw new Error('FATAL SECURITY ERROR: CORS_ORIGIN wildcard "*" is not allowed in production');
  }
}

export function loadConfig(): EnvironmentConfig {
  validateProductionEnvironment();

  const nodeEnv = process.env.NODE_ENV || 'development';
  const port = parseInt(process.env.PORT || '3100', 10);
  const host = process.env.HOST || '0.0.0.0';
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:55432/frose_street';
  const jwtSecret = process.env.JWT_SECRET || DEFAULT_DEV_JWT_SECRET;
  const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '30d';

  const corsOrigin = (process.env.CORS_ORIGIN || 'https://street.frostech.com,http://localhost:3100')
    .split(',')
    .map((s) => s.trim());

  const clientDir = path.resolve(process.cwd(), 'client');

  return {
    NODE_ENV: nodeEnv,
    PORT: port,
    HOST: host,
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: jwtExpiresIn,
    CORS_ORIGIN: corsOrigin,
    CLIENT_DIR: clientDir,
  };
}
