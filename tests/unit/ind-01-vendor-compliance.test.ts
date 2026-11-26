import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { getDatabase, closeDatabase } from '../../server/src/db/database.js';
import { signJoseAccessToken, getJwtKeyRotationConfig } from '../../server/src/modules/auth/jwt-jose.js';
import { loadConfig } from '../../server/src/config/env.js';
import fs from 'node:fs';
import path from 'node:path';

describe('IND-01: Vendor Compliance Profile (GSTIN, 14-digit FSSAI, Tax Mode, Stall Address)', () => {
  let app: FastifyInstance;
  let jwtConfig: any;
  let vendorAToken: string;
  let vendorBToken: string;
  let vendorAId: string;
  let vendorBId: string;

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'true';
    app = await buildApp({ logger: false });
    await app.ready();
    const config = (app as any).froseConfig || loadConfig();
    jwtConfig = getJwtKeyRotationConfig(config);

    // Register two vendors via HTTP to test profile isolation
    const regA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: {
        phone: '9111100001',
        password: 'StrongPassword!123',
        businessName: 'Compliance Stall A',
        ownerName: 'Owner A',
      },
    });
    expect(regA.statusCode).toBe(201);
    vendorAId = regA.json().vendor.id;

    const regB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: {
        phone: '9111100002',
        password: 'StrongPassword!123',
        businessName: 'Compliance Stall B',
        ownerName: 'Owner B',
      },
    });
    expect(regB.statusCode).toBe(201);
    vendorBId = regB.json().vendor.id;

    vendorAToken = await signJoseAccessToken(
      { sub: vendorAId, phone: '9111100001', businessName: 'Compliance Stall A', role: 'owner', edition: 'cloud' },
      jwtConfig,
      900,
    );
    vendorBToken = await signJoseAccessToken(
      { sub: vendorBId, phone: '9111100002', businessName: 'Compliance Stall B', role: 'owner', edition: 'cloud' },
      jwtConfig,
      900,
    );
  });

  afterAll(async () => {
    await app.close();
    await closeDatabase();
  });

  it('migration 016_add_vendor_compliance_fields exists and defines required columns & constraints', async () => {
    const migPath = path.resolve(process.cwd(), 'server/src/db/migrations/016_add_vendor_compliance_fields.ts');
    expect(fs.existsSync(migPath)).toBe(true);
    const src = fs.readFileSync(migPath, 'utf8');
    expect(src).toContain('tax_mode');
    expect(src).toContain('gstin');
    expect(src).toContain('fssai_number');
    expect(src).toContain('gst_rate_bps');
    expect(src).toContain('stall_address');
  });

  it('PATCH /api/v1/auth/profile accepts valid regular GSTIN (lowercase normalized), 14-digit FSSAI, and stall address', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/profile',
      headers: {
        authorization: `Bearer ${vendorAToken}`,
        'X-FROSE-CSRF': '1',
        origin: 'http://localhost:3100',
      },
      payload: {
        taxMode: 'regular',
        gstin: '36aabcu9603r1zm',
        fssaiNumber: '23626001000123',
        gstRateBps: 500,
        stallAddress: 'Stall 4, Jubilee Hills Food Court, Hyderabad',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.vendor.taxMode).toBe('regular');
    expect(body.vendor.gstin).toBe('36AABCU9603R1ZM');
    expect(body.vendor.fssaiNumber).toBe('23626001000123');
    expect(body.vendor.gstRateBps).toBe(500);
    expect(body.vendor.stallAddress).toBe('Stall 4, Jubilee Hills Food Court, Hyderabad');

    // Vendor B remains unaffected (unregistered, null GSTIN/FSSAI)
    const meB = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${vendorBToken}` },
    });
    expect(meB.statusCode).toBe(200);
    expect(meB.json().taxMode).toBe('unregistered');
    expect(meB.json().gstin).toBeNull();
  });

  it('rejects invalid GSTIN, invalid FSSAI (not 14 digits), missing GSTIN for composition/regular, and unknown fields', async () => {
    // 1. Missing GSTIN when taxMode is composition
    const missingGstin = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/profile',
      headers: {
        authorization: `Bearer ${vendorBToken}`,
        'X-FROSE-CSRF': '1',
        origin: 'http://localhost:3100',
      },
      payload: {
        taxMode: 'composition',
        gstin: null,
      },
    });
    expect(missingGstin.statusCode).toBe(400);

    // 2. Invalid GSTIN format
    const badGstin = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/profile',
      headers: {
        authorization: `Bearer ${vendorBToken}`,
        'X-FROSE-CSRF': '1',
        origin: 'http://localhost:3100',
      },
      payload: {
        taxMode: 'regular',
        gstin: 'INVALID12345',
      },
    });
    expect(badGstin.statusCode).toBe(400);

    // 3. Invalid FSSAI (not 14 digits)
    const badFssai = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/profile',
      headers: {
        authorization: `Bearer ${vendorBToken}`,
        'X-FROSE-CSRF': '1',
        origin: 'http://localhost:3100',
      },
      payload: {
        fssaiNumber: '1234567890',
      },
    });
    expect(badFssai.statusCode).toBe(400);

    // 4. Reject unknown field (mass assignment protection)
    const massAssign = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/profile',
      headers: {
        authorization: `Bearer ${vendorBToken}`,
        'X-FROSE-CSRF': '1',
        origin: 'http://localhost:3100',
      },
      payload: {
        is_superadmin: true,
      },
    });
    expect(massAssign.statusCode).toBe(400);

    // 5. Reject unsupported GST slab
    const badSlab = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/profile',
      headers: {
        authorization: `Bearer ${vendorBToken}`,
        'X-FROSE-CSRF': '1',
        origin: 'http://localhost:3100',
      },
      payload: {
        taxMode: 'regular',
        gstin: '36AABCU9603R1ZM',
        gstRateBps: 750,
      },
    });
    expect(badSlab.statusCode).toBe(400);
  });

  it('forces gstRateBps to 0 when taxMode is composition or unregistered', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/profile',
      headers: {
        authorization: `Bearer ${vendorBToken}`,
        'X-FROSE-CSRF': '1',
        origin: 'http://localhost:3100',
      },
      payload: {
        taxMode: 'composition',
        gstin: '27AABCU9603R1ZM',
        gstRateBps: 1800,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().vendor.taxMode).toBe('composition');
    expect(res.json().vendor.gstRateBps).toBe(0);
  });
});
