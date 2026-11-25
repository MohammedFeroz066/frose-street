import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { hashPassword, verifyPassword, hashPin, verifyPin, generateSecureToken } from '../../server/src/utils/crypto.js';
import { signJwt, verifyJwt } from '../../server/src/modules/auth/jwt.js';
import { requireAuth, requireRole } from '../../server/src/middleware/auth.js';
import { AuthService } from '../../server/src/modules/auth/auth.service.js';
import { buildApp } from '../../server/src/app.js';
import type { FastifyInstance } from 'fastify';

// In-memory data store for testing
const memoryVendors: Map<string, any> = new Map();
const memoryStaff: Map<string, any> = new Map();
const memoryBiometrics: Map<string, any> = new Map();

// Mock getDatabase implementation
vi.mock('../../server/src/db/database.js', () => {
  const createMockDb = () => {
    return {
      selectFrom: (table: string) => {
        let whereConditions: { col: string; val: any }[] = [];
        let isInnerJoin = false;

        const chain = {
          select: (_cols?: any) => chain,
          selectAll: () => chain,
          innerJoin: (_joinTable: string, _c1: string, _c2: string) => {
            isInnerJoin = true;
            return chain;
          },
          where: (col: string, _op: string, val: any) => {
            whereConditions.push({ col, val });
            return chain;
          },
          executeTakeFirst: async () => {
            if (table === 'vendors') {
              for (const v of memoryVendors.values()) {
                let match = true;
                for (const cond of whereConditions) {
                  const prop = cond.col.replace('vendors.', '');
                  if (v[prop] !== cond.val) match = false;
                }
                if (match) return { ...v };
              }
              return undefined;
            }

            if (table === 'biometric_credentials') {
              for (const b of memoryBiometrics.values()) {
                let match = true;
                for (const cond of whereConditions) {
                  const prop = cond.col.replace('biometric_credentials.', '');
                  if (b[prop] !== cond.val) match = false;
                }
                if (match) {
                  if (isInnerJoin) {
                    const vendor = memoryVendors.get(b.vendor_id);
                    if (!vendor) return undefined;
                    return {
                      id: vendor.id,
                      phone: vendor.phone,
                      business_name: vendor.business_name,
                      edition: vendor.edition,
                      subscription_status: vendor.subscription_status,
                      biometric_id: b.id,
                    };
                  }
                  return { ...b };
                }
              }
              return undefined;
            }

            return undefined;
          },
        };
        return chain;
      },
      insertInto: (table: string) => {
        return {
          values: (vals: any) => {
            const execute = async () => {
              const id = vals.id || `mock-uuid-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
              const record = { ...vals, id, created_at: new Date() };

              if (table === 'vendors') {
                memoryVendors.set(id, record);
              } else if (table === 'staff') {
                memoryStaff.set(id, record);
              } else if (table === 'biometric_credentials') {
                memoryBiometrics.set(id, record);
              }
              return record;
            };
            return {
              execute,
              returningAll: () => ({
                executeTakeFirstOrThrow: execute,
              }),
            };
          },
        };
      },
      updateTable: (table: string) => {
        return {
          set: (updates: any) => {
            return {
              where: (col: string, _op: string, val: any) => {
                return {
                  execute: async () => {
                    if (table === 'vendors') {
                      for (const [vId, v] of memoryVendors.entries()) {
                        if (v[col] === val || vId === val) {
                          memoryVendors.set(vId, { ...v, ...updates });
                        }
                      }
                    }
                    return;
                  },
                };
              },
            };
          },
        };
      },
    };
  };

  return {
    getDatabase: vi.fn(() => createMockDb()),
    closeDatabase: vi.fn(async () => {}),
  };
});

describe('Phase 5 Acceptance: Authentication (Phone, Password, Biometrics & PIN)', () => {
  const JWT_SECRET = 'frose-street-default-dev-secret-key-32chars';
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('TEST 1: Cryptographic Utilities (Salted scrypt & Quick PIN)', () => {
    it('hashPassword generates valid scrypt format with 16-byte salt', async () => {
      const hash = await hashPassword('MySecretPass123');
      expect(hash.startsWith('scrypt:16384:8:1:')).toBe(true);
      const parts = hash.split(':');
      expect(parts.length).toBe(6);
      expect(parts[4].length).toBe(32); // 16 bytes = 32 hex chars
      expect(parts[5].length).toBe(128); // 64 bytes = 128 hex chars
    });

    it('verifyPassword succeeds with correct password and fails with incorrect', async () => {
      const hash = await hashPassword('Biryani@2026');
      expect(await verifyPassword('Biryani@2026', hash)).toBe(true);
      expect(await verifyPassword('WrongPassword', hash)).toBe(false);
      expect(await verifyPassword('', hash)).toBe(false);
      expect(await verifyPassword('Biryani@2026', 'invalid:format')).toBe(false);
    });

    it('hashPin and verifyPin securely hashes and validates 4-digit PIN', async () => {
      const pinHash = await hashPin('1234');
      expect(pinHash.startsWith('scrypt:')).toBe(true);
      expect(await verifyPin('1234', pinHash)).toBe(true);
      expect(await verifyPin('9999', pinHash)).toBe(false);
      expect(await verifyPin('0000', pinHash)).toBe(false);
    });

    it('generateSecureToken generates cryptographically random hex strings', () => {
      const token1 = generateSecureToken(16);
      const token2 = generateSecureToken(16);
      const token32 = generateSecureToken(32);

      expect(token1.length).toBe(32);
      expect(token2.length).toBe(32);
      expect(token32.length).toBe(64);
      expect(token1).not.toBe(token2);
    });
  });

  describe('TEST 2: Stateless JWT Implementation (HS256)', () => {
    it('signJwt produces valid base64url HS256 JWT with expiration', () => {
      const token = signJwt(
        {
          sub: 'vendor-123',
          phone: '9876543210',
          businessName: 'Sharma Chaat Bhandar',
          role: 'owner',
          edition: 'cloud',
        },
        JWT_SECRET,
        3600,
      );

      const parts = token.split('.');
      expect(parts.length).toBe(3);

      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      expect(header.alg).toBe('HS256');
      expect(header.typ).toBe('JWT');

      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      expect(payload.sub).toBe('vendor-123');
      expect(payload.phone).toBe('9876543210');
      expect(payload.businessName).toBe('Sharma Chaat Bhandar');
      expect(payload.role).toBe('owner');
      expect(payload.edition).toBe('cloud');
      expect(payload.exp).toBeGreaterThan(payload.iat);
    });

    it('verifyJwt decodes and validates valid token', () => {
      const token = signJwt(
        {
          sub: 'vendor-456',
          phone: '9876543211',
          businessName: 'Gupta Tea Stall',
          role: 'cashier',
          edition: 'local',
        },
        JWT_SECRET,
      );

      const verified = verifyJwt(token, JWT_SECRET);
      expect(verified.sub).toBe('vendor-456');
      expect(verified.role).toBe('cashier');
      expect(verified.edition).toBe('local');
    });

    it('verifyJwt throws on tampered signature', () => {
      const token = signJwt(
        {
          sub: 'vendor-456',
          phone: '9876543211',
          businessName: 'Gupta Tea Stall',
          role: 'cashier',
          edition: 'local',
        },
        JWT_SECRET,
      );

      const [header, payload, sig] = token.split('.');
      const tamperedPayload = Buffer.from(
        JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')), role: 'owner' }),
      ).toString('base64url');
      const tamperedToken = `${header}.${tamperedPayload}.${sig}`;

      expect(() => verifyJwt(tamperedToken, JWT_SECRET)).toThrow(/Invalid JWT signature/);
    });

    it('verifyJwt throws on expired token', () => {
      const token = signJwt(
        {
          sub: 'vendor-789',
          phone: '9876543212',
          businessName: 'Old Stall',
          role: 'owner',
          edition: 'cloud',
        },
        JWT_SECRET,
        -10, // Expired 10 seconds ago
      );

      expect(() => verifyJwt(token, JWT_SECRET)).toThrow(/expired/);
    });

    it('verifyJwt throws on malformed token', () => {
      expect(() => verifyJwt('not-a-token', JWT_SECRET)).toThrow(/Malformed JWT/);
    });
  });

  describe('TEST 3: Auth Middleware (requireAuth & requireRole)', () => {
    it('requireAuth rejects unauthenticated request with 401', async () => {
      const req: any = { cookies: {}, headers: {} };
      const reply: any = {};

      await expect(requireAuth(req, reply)).rejects.toMatchObject({
        statusCode: 401,
        code: 'AUTH_REQUIRED',
      });
    });

    it('requireAuth accepts valid Bearer token from header', async () => {
      const token = signJwt(
        {
          sub: 'vendor-999',
          phone: '9999999999',
          businessName: 'Test Stall',
          role: 'owner',
          edition: 'cloud',
        },
        JWT_SECRET,
      );

      const req: any = {
        cookies: {},
        headers: { authorization: `Bearer ${token}` },
      };
      const reply: any = {};

      await requireAuth(req, reply);
      expect(req.user).toBeDefined();
      expect(req.user.sub).toBe('vendor-999');
      expect(req.user.role).toBe('owner');
    });

    it('requireRole allows allowed roles and rejects forbidden roles', async () => {
      const ownerCheck = requireRole('owner');
      const cashierCheck = requireRole('cashier');

      const ownerReq: any = { user: { role: 'owner' } };
      const reply: any = {};

      await expect(ownerCheck(ownerReq, reply)).resolves.toBeUndefined();
      await expect(cashierCheck(ownerReq, reply)).rejects.toMatchObject({
        statusCode: 403,
        code: 'INSUFFICIENT_PERMISSIONS',
      });
    });
  });

  describe('TEST 4: AuthService Input Validation', () => {
    it('rejects phone numbers with invalid length', async () => {
      const mockDb: any = {};
      await expect(
        AuthService.registerVendor(mockDb, {
          phone: '12345',
          password: 'SecurePass2026!',
          businessName: 'Test Stall',
          ownerName: 'Test Owner',
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_PHONE',
      });
    });

    it('rejects password shorter than 10 characters', async () => {
      const mockDb: any = {};
      await expect(
        AuthService.registerVendor(mockDb, {
          phone: '9876543210',
          password: '123',
          businessName: 'Test Stall',
          ownerName: 'Test Owner',
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'WEAK_PASSWORD',
      });
    });

    it('rejects empty stall / business name', async () => {
      const mockDb: any = {};
      await expect(
        AuthService.registerVendor(mockDb, {
          phone: '9876543210',
          password: 'SecurePass2026!',
          businessName: '   ',
          ownerName: 'Test Owner',
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'MISSING_BUSINESS_NAME',
      });
    });

    it('rejects PIN format not exactly 4 digits', async () => {
      const mockDb: any = {};
      await expect(AuthService.setupQuickPin(mockDb, 'v-1', '123')).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_PIN_FORMAT',
      });
      await expect(AuthService.setupQuickPin(mockDb, 'v-1', '12345')).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_PIN_FORMAT',
      });
      await expect(AuthService.setupQuickPin(mockDb, 'v-1', 'abcd')).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_PIN_FORMAT',
      });
    });
  });

  describe('TEST 5: End-to-End Auth API Routes via app.inject()', () => {
    let authToken = '';
    let registeredVendorId = '';
    const testPhone = '9876501234';
    const testPassword = 'Password@2026';

    it('POST /api/v1/auth/register: successfully registers vendor with phone & password', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          phone: testPhone,
          password: testPassword,
          businessName: 'Kolkata Kathi Rolls',
          ownerName: 'Subhash Sen',
          businessType: 'fast_food',
          city: 'Kolkata',
          edition: 'cloud',
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      expect(json.status).toBe('success');
      expect(json.vendor.phone).toBe(testPhone);
      expect(json.vendor.businessName).toBe('Kolkata Kathi Rolls');
      expect(json.vendor.subscriptionStatus).toBe('trial');
      expect(json.token).toBeDefined();

      // Check HttpOnly Cookie
      const cookieHeader = res.headers['set-cookie'];
      expect(cookieHeader).toBeDefined();
      expect(String(cookieHeader)).toContain('frose_street_token=');
      expect(String(cookieHeader)).toContain('HttpOnly');

      registeredVendorId = json.vendor.id;
      authToken = json.token;
    });

    it('POST /api/v1/auth/register: rejects duplicate registration with 409 Conflict', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          phone: testPhone,
          password: 'AnotherPassword@123',
          businessName: 'Duplicate Stall',
          ownerName: 'Duplicate',
        },
      });

      expect(res.statusCode).toBe(409);
      const json = JSON.parse(res.body);
      expect(json.code).toBe('PHONE_EXISTS');
      expect(json.title).toBe('Conflict');
    });

    it('POST /api/v1/auth/login: successfully logs in with correct phone and password', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          phone: testPhone,
          password: testPassword,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.status).toBe('success');
      expect(json.vendor.businessName).toBe('Kolkata Kathi Rolls');
      expect(json.token).toBeDefined();

      const cookieHeader = res.headers['set-cookie'];
      expect(String(cookieHeader)).toContain('frose_street_token=');
    });

    it('POST /api/v1/auth/login: rejects incorrect password with 401 Unauthorized', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          phone: testPhone,
          password: 'WrongPassword!',
        },
      });

      expect(res.statusCode).toBe(401);
      const json = JSON.parse(res.body);
      expect(json.code).toBe('INVALID_CREDENTIALS');
    });

    it('POST /api/v1/auth/setup-pin: configures 4-digit quick PIN for vendor', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/setup-pin',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          pin: '5678',
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.status).toBe('success');
      expect(json.message).toContain('configured successfully');
    });

    it('POST /api/v1/auth/verify-pin: verifies 4-digit quick PIN and issues session', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/verify-pin',
        payload: {
          vendorId: registeredVendorId,
          pin: '5678',
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.status).toBe('success');
      expect(json.token).toBeDefined();
    });

    it('POST /api/v1/auth/verify-pin: rejects wrong PIN with 401 Unauthorized', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/verify-pin',
        payload: {
          vendorId: registeredVendorId,
          pin: '9999',
        },
      });

      expect(res.statusCode).toBe(401);
      const json = JSON.parse(res.body);
      expect(json.code).toBe('INCORRECT_PIN');
    });

    it('POST /api/v1/auth/biometric/register: registers WebAuthn biometric credential', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/biometric/register',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          credentialId: 'webauthn-cred-test-id-001',
          publicKey: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA',
          deviceName: 'OnePlus 11 5G (Fingerprint)',
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      expect(json.status).toBe('success');
      expect(json.credentialId).toBe('webauthn-cred-test-id-001');
    });

    it('POST /api/v1/auth/biometric/verify: verifies biometric credential and logs in', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/biometric/verify',
        payload: {
          credentialId: 'webauthn-cred-test-id-001',
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.status).toBe('success');
      expect(json.vendor.businessName).toBe('Kolkata Kathi Rolls');
      expect(json.token).toBeDefined();
    });

    it('POST /api/v1/auth/biometric/verify: rejects unknown credential with 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/biometric/verify',
        payload: {
          credentialId: 'unknown-hardware-id-999',
        },
      });

      expect(res.statusCode).toBe(401);
      const json = JSON.parse(res.body);
      expect(json.code).toBe('BIOMETRIC_UNRECOGNIZED');
    });

    it('GET /api/v1/auth/me: returns authenticated vendor profile', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.phone).toBe(testPhone);
      expect(json.businessName).toBe('Kolkata Kathi Rolls');
      expect(json.role).toBe('owner');
      expect(json.hasQuickPin).toBe(true);
    });

    it('GET /api/v1/auth/me: rejects unauthenticated call with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
      });

      expect(res.statusCode).toBe(401);
      const json = JSON.parse(res.body);
      expect(json.code).toBe('AUTH_REQUIRED');
    });

    it('POST /api/v1/auth/logout: clears session cookie', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.status).toBe('success');

      const cookieHeader = res.headers['set-cookie'];
      expect(String(cookieHeader)).toContain('frose_street_token=;');
    });
  });
});
