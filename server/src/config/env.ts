import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config();

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

export function loadConfig(): EnvironmentConfig {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const port = parseInt(process.env.PORT || '3100', 10);
  const host = process.env.HOST || '0.0.0.0';
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:55432/frose_street';
  const jwtSecret = process.env.JWT_SECRET || 'frose-street-default-dev-secret-key-32chars';
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
