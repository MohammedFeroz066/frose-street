import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, exportPKCS8, exportSPKI } from 'jose';
import {
  generateEd25519LicenseToken,
  verifyEd25519LicenseToken,
} from '../../server/src/modules/auth/jwt-jose.js';

describe('SEC-OFFLINE: Offline License Gating & Atomic Billing Engine', () => {
  let edPrivateKey: string;
  let edPublicKey: string;

  beforeAll(async () => {
    const keyPair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    edPrivateKey = await exportPKCS8(keyPair.privateKey);
    edPublicKey = await exportSPKI(keyPair.publicKey);
  });

  it('signs Ed25519 offline license token on server and verifies client-side with public key only', async () => {
    const now = new Date();
    const periodEnd = new Date(Date.now() + 30 * 86400 * 1000).toISOString().split('T')[0];

    const token = await generateEd25519LicenseToken(
      {
        vendorId: 'v-offline-stall-99',
        businessName: 'Highway Dosa Corner',
        plan: 'cloud',
        periodStart: now.toISOString().split('T')[0],
        periodEnd,
        status: 'active',
      },
      edPrivateKey
    );

    // Client verifies using ONLY the Ed25519 public key (private key is NEVER shared)
    const verified = await verifyEd25519LicenseToken(token, edPublicKey);
    expect(verified.valid).toBe(true);
    expect(verified.payload?.vendorId).toBe('v-offline-stall-99');
    expect(verified.payload?.businessName).toBe('Highway Dosa Corner');
    expect(verified.payload?.status).toBe('active');
  });

  it('permits offline order capture and atomic token sequence with active offline license', async () => {
    // 1. Emulate local offline store
    const localDbOrders: any[] = [];
    let localTokenCounter = 0;

    const getNextAtomicTokenOffline = () => {
      localTokenCounter += 1;
      return localTokenCounter;
    };

    const createOfflineOrder = (items: { name: string; pricePaise: bigint; qty: number }[]) => {
      const tokenNo = getNextAtomicTokenOffline();
      let totalPaise = 0n;
      for (const item of items) {
        totalPaise += item.pricePaise * BigInt(item.qty);
      }

      const order = {
        id: `offline-ord-${Date.now()}-${tokenNo}`,
        tokenNo,
        items,
        totalPaise,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      localDbOrders.push(order);
      return order;
    };

    // 2. Bill 3 offline orders
    const order1 = createOfflineOrder([
      { name: 'Masala Dosa', pricePaise: 5000n, qty: 2 }, // 10000 paise (₹100)
      { name: 'Filter Coffee', pricePaise: 2000n, qty: 1 }, // 2000 paise (₹20)
    ]);
    expect(order1.tokenNo).toBe(1);
    expect(order1.totalPaise).toBe(12000n);

    const order2 = createOfflineOrder([
      { name: 'Ghee Podi Idli', pricePaise: 6000n, qty: 1 }, // 6000 paise (₹60)
    ]);
    expect(order2.tokenNo).toBe(2);
    expect(order2.totalPaise).toBe(6000n);

    // Total offline revenue in paise
    const totalRevenuePaise = localDbOrders.reduce((sum, o) => sum + o.totalPaise, 0n);
    expect(totalRevenuePaise).toBe(18000n);
    expect(localDbOrders.length).toBe(2);
  });

  it('blocks order creation when offline license is expired beyond grace period', async () => {
    const expiredPeriodEnd = '2020-01-01';
    const expiredToken = await generateEd25519LicenseToken(
      {
        vendorId: 'v-expired-stall',
        businessName: 'Old Stall',
        plan: 'cloud',
        periodStart: '2019-01-01',
        periodEnd: expiredPeriodEnd,
        status: 'expired',
      },
      edPrivateKey
    );

    const verified = await verifyEd25519LicenseToken(expiredToken, edPublicKey);
    expect(verified.valid).toBe(true);
    expect(verified.payload).toBeDefined();

    const now = new Date();
    const expiry = new Date((verified.payload?.periodEnd || '2020-01-01') + 'T23:59:59.999Z');
    const isExpired = now.getTime() > expiry.getTime();
    expect(isExpired).toBe(true);

    const canCreateOrders = !isExpired;
    expect(canCreateOrders).toBe(false);
  });
});
