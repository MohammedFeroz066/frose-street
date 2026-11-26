import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { DeviceService } from '../../server/src/modules/devices/device.service.js';

describe('CHORE-DEPS-CLEANUP: Dependencies & Cookie-Only Device Pairing', () => {
  const rootDir = path.resolve(__dirname, '../..');
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'true';
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('package.json removes unused @fastify/jwt and upgrades kysely to >=0.28.17', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    expect(pkg.dependencies['@fastify/jwt']).toBeUndefined();
    const kyselySpec = String(pkg.dependencies['kysely'] || '').replace(/^[\^~>=< ]+/, '');
    const [major, minor, patch] = kyselySpec.split('.').map(Number);
    expect(major).toBe(0);
    expect(minor).toBe(28);
    expect(patch).toBeGreaterThanOrEqual(17);
  });

  it('client/ has zero frose_device_token localStorage references', () => {
    const kitchenJs = fs.readFileSync(path.join(rootDir, 'client/js/kitchen.js'), 'utf8');
    const packagingJs = fs.readFileSync(path.join(rootDir, 'client/js/packaging.js'), 'utf8');
    expect(kitchenJs).not.toContain('frose_device_token');
    expect(packagingJs).not.toContain('frose_device_token');
  });

  it('POST /api/v1/devices/pair sets HttpOnly cookie only and omits raw token from JSON body', async () => {
    const config = (app as any).froseConfig;
    const { getDatabase } = await import('../../server/src/db/database.js');
    const db = getDatabase();
    const vendorId = 'v-stall-demo-01';

    const pairing = await DeviceService.generatePairingToken(vendorId, 'cook', config.JWT_SECRET, 'KDS Clean');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/devices/pair',
      headers: {
        'X-FROSE-CSRF': '1',
        origin: 'http://localhost:3100',
      },
      payload: {
        pairingToken: pairing.pairingToken,
        deviceName: 'KDS Clean',
      },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.status).toBe('success');
    expect(json.device).toBeDefined();
    expect(json.token).toBeUndefined();

    const accessCookie = res.cookies.find((c) => c.name === 'frose_access_token');
    expect(accessCookie).toBeDefined();
    expect(accessCookie?.httpOnly).toBe(true);
    expect(accessCookie?.sameSite?.toLowerCase()).toBe('strict');
    expect(db).toBeDefined();
  });
});
