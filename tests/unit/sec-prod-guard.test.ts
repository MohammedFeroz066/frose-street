import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateProductionEnvironment } from '../../server/src/config/env.js';

describe('SEC-PROD-GUARD / Step 1A.5: Production Startup Security Guards', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('refuses production startup if USE_MEMORY_DB=true', () => {
    process.env.NODE_ENV = 'production';
    process.env.USE_MEMORY_DB = 'true';
    process.env.JWT_SECRET = 'a-very-long-production-grade-secret-key-min-32-chars!';
    process.env.CORS_ORIGIN = 'https://street.frostech.com';

    expect(() => validateProductionEnvironment()).toThrow(/USE_MEMORY_DB cannot be true in production/i);
  });

  it('refuses production startup if JWT_SECRET is missing', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.USE_MEMORY_DB;
    delete process.env.JWT_SECRET;
    process.env.CORS_ORIGIN = 'https://street.frostech.com';

    expect(() => validateProductionEnvironment()).toThrow(/JWT_SECRET is required in production/i);
  });

  it('refuses production startup if JWT_SECRET is shorter than 32 characters', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.USE_MEMORY_DB;
    process.env.JWT_SECRET = 'short-secret-123';
    process.env.CORS_ORIGIN = 'https://street.frostech.com';

    expect(() => validateProductionEnvironment()).toThrow(/JWT_SECRET must be at least 32 characters/i);
  });

  it('refuses production startup if JWT_SECRET is the default developer secret', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.USE_MEMORY_DB;
    process.env.JWT_SECRET = 'frose-street-default-dev-secret-key-32chars';
    process.env.CORS_ORIGIN = 'https://street.frostech.com';

    expect(() => validateProductionEnvironment()).toThrow(/Default development JWT_SECRET cannot be used in production/i);
  });

  it('refuses production startup if CORS_ORIGIN is unset or empty', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.USE_MEMORY_DB;
    process.env.JWT_SECRET = 'a-very-long-production-grade-secret-key-min-32-chars!';
    delete process.env.CORS_ORIGIN;

    expect(() => validateProductionEnvironment()).toThrow(/CORS_ORIGIN must be explicitly configured in production/i);
  });

  it('refuses production startup if CORS_ORIGIN contains wildcard "*"', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.USE_MEMORY_DB;
    process.env.JWT_SECRET = 'a-very-long-production-grade-secret-key-min-32-chars!';
    process.env.CORS_ORIGIN = '*';

    expect(() => validateProductionEnvironment()).toThrow(/wildcard "\*" is not allowed in production/i);
  });

  it('passes validation when production configuration is fully hardened', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.USE_MEMORY_DB;
    process.env.JWT_SECRET = 'a-very-long-production-grade-secret-key-min-32-chars!';
    process.env.CORS_ORIGIN = 'https://street.frostech.com';

    expect(() => validateProductionEnvironment()).not.toThrow();
  });
});
