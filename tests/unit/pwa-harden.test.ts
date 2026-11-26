import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function signEd25519Jwt(payload: Record<string, any>, privateKey: crypto.KeyObject): string {
  const headerB64 = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' })).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = crypto.sign(null, Buffer.from(signingInput), privateKey).toString('base64url');
  return `${signingInput}.${sig}`;
}

describe('PWA-HARDEN: Persistent Storage, Anti-Clock-Rollback & SW Update Banner', () => {
  const clientDir = path.resolve(__dirname, '../../client');

  beforeEach(async () => {
    const idbMod = await import('../../client/js/idb-store.js');
    const store = idbMod.default || (globalThis as any).FroseIdbStore;
    if (store && typeof store.clearAllStores === 'function') {
      await store.clearAllStores();
    }
  });

  it('idb-store.js exposes requestPersistentStorage and handles unsupported/supported navigator.storage.persist cleanly', async () => {
    const idbMod = await import('../../client/js/idb-store.js');
    const store = idbMod.default || (globalThis as any).FroseIdbStore;
    expect(typeof store.requestPersistentStorage).toBe('function');

    // Should gracefully return false when navigator.storage.persist is unavailable or mocked
    const res = await store.requestPersistentStorage();
    expect(typeof res).toBe('boolean');

    const src = fs.readFileSync(path.join(clientDir, 'js/idb-store.js'), 'utf8');
    expect(src).toContain('navigator.storage');
    expect(src).toContain('persist');
  });

  it('clock-rollback detection fails closed (CLOCK_ROLLBACK_DETECTED) when Date.now() < lastSeenAt - 60000 and forward clock passes', async () => {
    const idbMod = await import('../../client/js/idb-store.js');
    const store = idbMod.default || (globalThis as any).FroseIdbStore;
    const storageMod = await import('../../client/js/storage-adapter.js');
    const { LicenseManager, SyncEngine } = storageMod;

    expect(typeof store.recordLastSeenAt).toBe('function');
    expect(typeof store.checkClockRollback).toBe('function');

    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

    const nowMs = Date.now();
    const futurePeriodEnd = new Date(nowMs + 10 * 86400_000).toISOString().slice(0, 10);
    const token = signEd25519Jwt(
      {
        vendorId: '11111111-1111-1111-1111-111111111111',
        businessName: 'Clock Test Stall',
        plan: 'cloud',
        periodStart: new Date(nowMs - 86400_000).toISOString().slice(0, 10),
        periodEnd: futurePeriodEnd,
        status: 'active',
        issuedAt: new Date(nowMs).toISOString(),
        exp: Math.floor((nowMs + 10 * 86400_000) / 1000),
      },
      privateKey,
    );

    await LicenseManager.saveLicense(token, {
      vendorId: '11111111-1111-1111-1111-111111111111',
      publicKeyPem,
    });

    // Record monotonic lastSeenAt at current time
    await store.recordLastSeenAt(nowMs);

    // 1. Forward clock (now + 5 minutes) passes cleanly
    const forwardCheck = await store.checkClockRollback(nowMs + 300_000);
    expect(forwardCheck.ok).toBe(true);

    // 2. Small clock skew within 60s tolerance passes cleanly
    const skewCheck = await store.checkClockRollback(nowMs + 300_000 - 30_000);
    expect(skewCheck.ok).toBe(true);

    // 3. Clock rolled back > 60s behind lastSeenAt fails closed
    const rolledBackNow = nowMs - 120_000;
    const rollbackCheck = await store.checkClockRollback(rolledBackNow);
    expect(rollbackCheck.ok).toBe(false);
    expect(rollbackCheck.code).toBe('CLOCK_ROLLBACK_DETECTED');

    // 4. SyncEngine.queueOfflineOrder fails closed when clock is rolled back
    const engine = new SyncEngine({
      store,
      vendorId: '11111111-1111-1111-1111-111111111111',
      nowImpl: () => rolledBackNow,
    });

    await expect(
      engine.queueOfflineOrder({
        vendorId: '11111111-1111-1111-1111-111111111111',
        items: [{ menuItemId: 'm1', name: 'Chai', quantity: 1, pricePaise: 1500 }],
        totalPaise: 1500,
        paymentMethod: 'cash',
      }),
    ).rejects.toThrow(/CLOCK_ROLLBACK_DETECTED/);

    // 5. Forward clock allows offline order cleanly
    const forwardEngine = new SyncEngine({
      store,
      vendorId: '11111111-1111-1111-1111-111111111111',
      nowImpl: () => nowMs + 600_000,
    });

    const queued = await forwardEngine.queueOfflineOrder({
      vendorId: '11111111-1111-1111-1111-111111111111',
      items: [{ menuItemId: 'm1', name: 'Chai', quantity: 1, pricePaise: 1500 }],
      totalPaise: 1500,
      paymentMethod: 'cash',
    });
    expect(queued.ok).toBe(true);
  });

  it('sw.js handles SKIP_WAITING message without unconditional install skipWaiting, and billing.js wires updatefound banner', () => {
    const swSrc = fs.readFileSync(path.join(clientDir, 'sw.js'), 'utf8');
    const billingSrc = fs.readFileSync(path.join(clientDir, 'js/billing.js'), 'utf8');

    expect(swSrc).toContain('SKIP_WAITING');
    expect(swSrc).toMatch(/addEventListener\(\s*['"]message['"]/);
    // Must not unconditionally skipWaiting inside install event handler
    const installBlock = swSrc.match(/addEventListener\(\s*['"]install['"][\s\S]*?\n\}\);/);
    expect(installBlock).not.toBeNull();
    expect(installBlock![0]).not.toContain('self.skipWaiting()');

    expect(billingSrc).toContain('updatefound');
    expect(billingSrc).toContain('SKIP_WAITING');
    expect(billingSrc).toContain('New update ready — Tap to reload');
  });
});
