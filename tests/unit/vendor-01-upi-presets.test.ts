import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { AuthService } from '../../server/src/modules/auth/auth.service.js';
import { MenuService } from '../../server/src/modules/menu/menu.service.js';
import { STREET_MENU_PRESETS } from '../../server/src/modules/menu/menu.presets.js';
import { allMigrations } from '../../server/src/db/migrator.js';
import { getDatabase } from '../../server/src/db/database.js';
import { signJoseAccessToken, getJwtKeyRotationConfig } from '../../server/src/modules/auth/jwt-jose.js';
import { loadConfig } from '../../server/src/config/env.js';

describe('VENDOR-01: Persistent Stall UPI Profile, Real Scannable QR & Dietary Presets', () => {
  let app: FastifyInstance;
  let vendorId: string;
  let accessCookie: string;

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'true';
    app = await buildApp({ logger: false });
    await app.ready();

    const db = getDatabase();
    const config = loadConfig();
    const jwtConfig = getJwtKeyRotationConfig(config);

    const reg = await AuthService.registerVendor(db, {
      phone: `95${Math.floor(10000000 + Math.random() * 89999999)}`,
      password: 'Vendor01StrongPass!',
      businessName: 'VENDOR01 Test Stall',
      ownerName: 'Vendor 01',
      edition: 'cloud',
    });
    vendorId = reg.vendor.id;

    const token = await signJoseAccessToken(
      {
        sub: vendorId,
        phone: reg.vendor.phone,
        businessName: reg.vendor.business_name,
        role: 'owner',
        edition: 'cloud',
      },
      jwtConfig,
      900,
    );
    accessCookie = `frose_access_token=${token}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers migration 021_vendor_upi_and_galla_counted in migrator.ts', () => {
    expect(allMigrations['021_vendor_upi_and_galla_counted']).toBeDefined();
    expect(typeof allMigrations['021_vendor_upi_and_galla_counted'].up).toBe('function');
    expect(typeof allMigrations['021_vendor_upi_and_galla_counted'].down).toBe('function');
  });

  it('persists upiId and payeeName via PATCH /api/v1/auth/profile and returns them from GET /api/v1/auth/me', async () => {
    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/profile',
      headers: {
        cookie: accessCookie,
        'x-frose-csrf': '1',
        origin: 'http://localhost:3100',
      },
      payload: {
        upiId: 'vendor01.stall@okaxis',
        payeeName: 'Vendor 01 Momo Counter',
      },
    });

    expect(patchRes.statusCode).toBe(200);
    const patchData = patchRes.json();
    expect(patchData.vendor.upiId).toBe('vendor01.stall@okaxis');
    expect(patchData.vendor.payeeName).toBe('Vendor 01 Momo Counter');

    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: accessCookie },
    });
    expect(meRes.statusCode).toBe(200);
    const meData = meRes.json();
    expect(meData.upiId).toBe('vendor01.stall@okaxis');
    expect(meData.payeeName).toBe('Vendor 01 Momo Counter');
  });

  it('rejects invalid UPI VPA and unknown fields on PATCH /api/v1/auth/profile', async () => {
    const badVpa = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/profile',
      headers: {
        cookie: accessCookie,
        'x-frose-csrf': '1',
        origin: 'http://localhost:3100',
      },
      payload: {
        upiId: 'not-a-valid-upi',
      },
    });
    expect(badVpa.statusCode).toBe(400);

    const unknownField = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/profile',
      headers: {
        cookie: accessCookie,
        'x-frose-csrf': '1',
        origin: 'http://localhost:3100',
      },
      payload: {
        upiId: 'valid@okaxis',
        is_superadmin: true,
      },
    });
    expect(unknownField.statusCode).toBe(400);
  });

  it('defines explicit boolean isVeg on every preset item and persists is_veg in seedPresets()', async () => {
    for (const [key, preset] of Object.entries(STREET_MENU_PRESETS)) {
      for (const item of preset.items) {
        expect(typeof (item as any).isVeg, `${key}:${item.name} must have boolean isVeg`).toBe('boolean');
        if (/\b(chicken|mutton|egg|fish)\b/i.test(item.name)) {
          expect((item as any).isVeg, `${key}:${item.name} must be isVeg: false`).toBe(false);
        }
      }
    }

    const db = getDatabase();
    await MenuService.seedPresets(db, vendorId, 'momos_chinese');
    const items = await MenuService.getMenuItems(db, vendorId);
    const chickenMomos = items.find((i) => i.name.includes('Chicken Steamed Momos'));
    const vegMomos = items.find((i) => i.name.includes('Veg Steamed Momos'));
    expect(chickenMomos).toBeDefined();
    expect(vegMomos).toBeDefined();
    expect(chickenMomos!.isVeg).toBe(false);
    expect(vegMomos!.isVeg).toBe(true);
  });

  it('client payUpiOrder and settings-component use FroseQrLocal instead of fake decorative SVG', () => {
    const billingJs = fs.readFileSync(path.resolve(__dirname, '../../client/js/billing.js'), 'utf8');
    const settingsJs = fs.readFileSync(path.resolve(__dirname, '../../client/js/settings-component.js'), 'utf8');

    expect(billingJs).toContain('FroseQrLocal');
    expect(billingJs).toContain('upi://pay?pa=');
    expect(billingJs).not.toContain("viewBox: '0 0 160 160'");

    expect(settingsJs).toContain('FroseQrLocal');
    expect(settingsJs).toContain('/api/v1/auth/profile');
    expect(settingsJs).not.toContain("viewBox: '0 0 64 64'");
  });
});
