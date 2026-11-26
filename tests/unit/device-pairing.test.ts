import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { DeviceService } from '../../server/src/modules/devices/device.service.js';
import { signJwt, verifyJwt } from '../../server/src/modules/auth/jwt.js';
import { buildApp } from '../../server/src/app.js';
import type { FastifyInstance } from 'fastify';

// In-memory data store for testing
const memoryVendors: Map<string, any> = new Map();
const memoryDevices: Map<string, any> = new Map();

// Mock getDatabase implementation
vi.mock('../../server/src/db/database.js', () => {
  const createMockDb = () => {
    return {
      selectFrom: (table: string) => {
        let whereConditions: { col: string; val: any }[] = [];

        const chain = {
          select: (_cols?: any) => chain,
          selectAll: () => chain,
          where: (col: string, _op: string, val: any) => {
            whereConditions.push({ col, val });
            return chain;
          },
          orderBy: (_col: string, _dir?: string) => chain,
          execute: async () => {
            if (table === 'devices') {
              const matched: any[] = [];
              for (const d of memoryDevices.values()) {
                let match = true;
                for (const cond of whereConditions) {
                  const prop = cond.col.replace('devices.', '');
                  if (d[prop] !== cond.val) match = false;
                }
                if (match) matched.push({ ...d });
              }
              return matched;
            }
            return [];
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

            if (table === 'devices') {
              for (const d of memoryDevices.values()) {
                let match = true;
                for (const cond of whereConditions) {
                  const prop = cond.col.replace('devices.', '');
                  if (d[prop] !== cond.val) match = false;
                }
                if (match) return { ...d };
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
            return {
              returningAll: () => ({
                executeTakeFirstOrThrow: async () => {
                  const id = vals.id || `mock-dev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                  const record = { ...vals, id, created_at: new Date() };

                  if (table === 'devices') {
                    memoryDevices.set(id, record);
                  } else if (table === 'vendors') {
                    memoryVendors.set(id, record);
                  }
                  return record;
                },
              }),
            };
          },
        };
      },
      updateTable: (table: string) => {
        return {
          set: (updates: any) => {
            return {
              where: (col1: string, _op1: string, val1: any) => {
                return {
                  where: (col2: string, _op2: string, val2: any) => {
                    return {
                      execute: async () => {
                        if (table === 'devices') {
                          for (const [dId, d] of memoryDevices.entries()) {
                            if ((d[col1] === val1 || dId === val1) && (d[col2] === val2 || dId === val2)) {
                              memoryDevices.set(dId, { ...d, ...updates });
                            }
                          }
                        }
                      },
                    };
                  },
                  execute: async () => {
                    if (table === 'devices') {
                      for (const [dId, d] of memoryDevices.entries()) {
                        if (d[col1] === val1 || dId === val1) {
                          memoryDevices.set(dId, { ...d, ...updates });
                        }
                      }
                    }
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

describe('Phase 6 Acceptance: Device Pairing — QR-Based Kitchen/Packer Connection', () => {
  const JWT_SECRET = 'frose-street-default-dev-secret-key-32chars';
  let app: FastifyInstance;
  const mockVendorId = 'vendor-stall-phase-6';
  let cashierToken = '';

  beforeAll(async () => {
    // Seed vendor in memory
    memoryVendors.set(mockVendorId, {
      id: mockVendorId,
      phone: '9876543210',
      business_name: 'Hyderabadi Dum Chai & Samosa',
      owner_name: 'Mirza Baig',
      edition: 'cloud',
      subscription_status: 'trial',
    });

    // Create cashier token for authorized calls
    cashierToken = signJwt(
      {
        sub: mockVendorId,
        phone: '9876543210',
        businessName: 'Hyderabadi Dum Chai & Samosa',
        role: 'cashier',
        edition: 'cloud',
      },
      JWT_SECRET,
    );

    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    DeviceService._resetConsumedTokens();
  });

  describe('TEST 1: QR Pairing Token Generation & Formatting', () => {
    it('generates valid 5-minute pairing token and QR code PNG data URL for cook', async () => {
      const result = await DeviceService.generatePairingToken(mockVendorId, 'cook', JWT_SECRET);

      expect(result.pairingToken).toBeDefined();
      expect(result.pairingToken.split('.').length).toBe(2);
      expect(result.role).toBe('cook');
      expect(result.deviceName).toBe('Kitchen Display');
      expect(result.expiresInSeconds).toBe(300);

      // Verify QR Code Data URL format
      expect(result.qrCodeDataUrl.startsWith('data:image/png;base64,')).toBe(true);
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('generates valid pairing token and default device name for packer', async () => {
      const result = await DeviceService.generatePairingToken(mockVendorId, 'packer', JWT_SECRET);

      expect(result.role).toBe('packer');
      expect(result.deviceName).toBe('Packaging Station');
      expect(result.qrCodeDataUrl.startsWith('data:image/png;base64,')).toBe(true);
    });

    it('rejects pairing generation with invalid role', async () => {
      await expect(
        DeviceService.generatePairingToken(mockVendorId, 'invalid-role' as any, JWT_SECRET),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_ROLE',
      });
    });
  });

  describe('TEST 2: Pairing Security, Expiration & Single-Use Replay Protection', () => {
    it('rejects malformed pairing token with 400', async () => {
      const mockDb: any = {};
      await expect(DeviceService.pairDevice(mockDb, 'malformed-token-string', JWT_SECRET)).rejects.toMatchObject({
        statusCode: 400,
        code: 'MALFORMED_TOKEN',
      });
    });

    it('rejects tampered signature with 401 Unauthorized', async () => {
      const { pairingToken } = await DeviceService.generatePairingToken(mockVendorId, 'cook', JWT_SECRET);
      const [payload, sig] = pairingToken.split('.');
      const tamperedToken = `${payload}.${sig}xyz`;

      const mockDb: any = {};
      await expect(DeviceService.pairDevice(mockDb, tamperedToken, JWT_SECRET)).rejects.toMatchObject({
        statusCode: 401,
        code: 'INVALID_SIGNATURE',
      });
    });

    it('rejects expired pairing token with 400 TOKEN_EXPIRED', async () => {
      const { pairingToken } = await DeviceService.generatePairingToken(
        mockVendorId,
        'cook',
        JWT_SECRET,
        'Old Screen',
        -10, // Expired 10 seconds ago
      );

      const mockDb: any = {};
      await expect(DeviceService.pairDevice(mockDb, pairingToken, JWT_SECRET)).rejects.toMatchObject({
        statusCode: 400,
        code: 'TOKEN_EXPIRED',
      });
    });

    it('enforces single-use consumption: rejects replay of the same token with 409 Conflict', async () => {
      const { pairingToken } = await DeviceService.generatePairingToken(mockVendorId, 'cook', JWT_SECRET);

      const { getDatabase } = await import('../../server/src/db/database.js');
      const db = getDatabase();

      // First pairing succeeds
      const firstPair = await DeviceService.pairDevice(db, pairingToken, JWT_SECRET, 'Cook Android 1');
      expect(firstPair.device.role).toBe('cook');

      // Second pairing with exact same QR code token must fail with 409
      await expect(DeviceService.pairDevice(db, pairingToken, JWT_SECRET, 'Attacker Clone')).rejects.toMatchObject({
        statusCode: 409,
        code: 'TOKEN_ALREADY_USED',
      });
    });
  });

  describe('TEST 3: End-to-End Pairing API Endpoints via app.inject()', () => {
    let generatedToken = '';
    let pairedDeviceId = '';
    let cookJwt = '';

    it('POST /api/v1/devices/pairing-token: Cashier generates pairing QR code', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/devices/pairing-token',
        headers: {
          authorization: `Bearer ${cashierToken}`,
        },
        payload: {
          role: 'cook',
          deviceName: 'Grill Counter Tablet',
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.status).toBe('success');
      expect(json.pairingToken).toBeDefined();
      expect(json.qrCodeDataUrl.startsWith('data:image/png;base64,')).toBe(true);
      expect(json.deviceName).toBe('Grill Counter Tablet');
      expect(json.role).toBe('cook');

      generatedToken = json.pairingToken;
    });

    it('POST /api/v1/devices/pairing-token: Rejects call without cashier/owner role', async () => {
      // Create helper cook token
      const cookUnauthorizedToken = signJwt(
        {
          sub: mockVendorId,
          phone: '9876543210',
          businessName: 'Hyderabadi Dum Chai & Samosa',
          role: 'cook',
          edition: 'cloud',
        },
        JWT_SECRET,
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/devices/pairing-token',
        headers: {
          authorization: `Bearer ${cookUnauthorizedToken}`,
        },
        payload: {
          role: 'cook',
        },
      });

      expect(res.statusCode).toBe(403);
      const json = JSON.parse(res.body);
      expect(json.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('POST /api/v1/devices/pair: Helper device scans QR code and pairs', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/devices/pair',
        payload: {
          pairingToken: generatedToken,
          deviceName: 'Kitchen Line 1 Display',
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.status).toBe('success');
      expect(json.device.deviceName).toBe('Kitchen Line 1 Display');
      expect(json.device.role).toBe('cook');
      expect(json.portalUrl).toBe('/kitchen');
      expect(json.token).toBeUndefined();

      // Check cookie
      const cookieHeader = res.headers['set-cookie'];
      expect(String(cookieHeader)).toContain('frose_access_token=');
      expect(String(cookieHeader)).not.toContain('frose_street_token=');
      expect(String(cookieHeader)).toContain('HttpOnly');

      const accessCookie = res.cookies.find((c) => c.name === 'frose_access_token');
      expect(accessCookie).toBeDefined();
      pairedDeviceId = json.device.id;
      cookJwt = accessCookie!.value;

      // Verify scoped JWT claims
      const decoded = verifyJwt(cookJwt, JWT_SECRET);
      expect(decoded.sub).toBe(mockVendorId);
      expect(decoded.role).toBe('cook');
      expect(decoded.deviceId).toBe(pairedDeviceId);
    });

    it('GET /api/v1/devices: Lists all active paired stall devices', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/devices',
        headers: {
          authorization: `Bearer ${cashierToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.status).toBe('success');
      expect(Array.isArray(json.devices)).toBe(true);

      const found = json.devices.find((d: any) => d.id === pairedDeviceId);
      expect(found).toBeDefined();
      expect(found.deviceName).toBe('Kitchen Line 1 Display');
      expect(found.role).toBe('cook');
      expect(found.isActive).toBe(true);
    });

    it('DELETE /api/v1/devices/:id: Disconnects/revokes paired device', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/devices/${pairedDeviceId}`,
        headers: {
          authorization: `Bearer ${cashierToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.status).toBe('success');
      expect(json.message).toContain('disconnected successfully');
    });

    it('DELETE /api/v1/devices/:id: Rejects invalid or non-existent device id with 404', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/devices/non-existent-device-999',
        headers: {
          authorization: `Bearer ${cashierToken}`,
        },
      });

      expect(res.statusCode).toBe(404);
      const json = JSON.parse(res.body);
      expect(json.code).toBe('DEVICE_NOT_FOUND');
    });
  });
});
