import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateKeyPair,
  exportPKCS8,
  exportSPKI,
  SignJWT,
  jwtVerify,
} from 'jose';
import {
  signJoseAccessToken,
  verifyJoseAccessToken,
  generateEd25519LicenseToken,
  verifyEd25519LicenseToken,
  getJwtKeyRotationConfig,
} from '../../server/src/modules/auth/jwt-jose.js';

describe('SEC-02: jose HS256 Token Pinned Verification, Key Rotation & Ed25519 Offline License', () => {
  const currentSecret = 'a-super-secret-random-key-at-least-32-chars-long-current!!';
  const previousSecret = 'a-super-secret-random-key-at-least-32-chars-long-previous!';
  let edPrivateKey: string;
  let edPublicKey: string;

  beforeAll(async () => {
    // Generate an Ed25519 keypair for tests
    const keyPair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    edPrivateKey = await exportPKCS8(keyPair.privateKey);
    edPublicKey = await exportSPKI(keyPair.publicKey);
  });

  describe('1. HS256 Access Token via jose', () => {
    it('signs and verifies a valid token using current key with pinned HS256 algorithm', async () => {
      const config = {
        currentSecret,
        currentKid: 'key-2026-curr',
        previousSecret,
        previousKid: 'key-2026-prev',
      };

      const token = await signJoseAccessToken(
        {
          sub: 'v-stall-01',
          phone: '9876543210',
          businessName: 'Biryani Stall',
          role: 'owner',
          edition: 'cloud',
        },
        config,
        900 // 15 mins
      );

      const verified = await verifyJoseAccessToken(token, config);
      expect(verified.sub).toBe('v-stall-01');
      expect(verified.phone).toBe('9876543210');
      expect(verified.role).toBe('owner');
    });

    it('verifies a token signed with the previous key during key rotation', async () => {
      const config = {
        currentSecret,
        currentKid: 'key-2026-curr',
        previousSecret,
        previousKid: 'key-2026-prev',
      };

      // Sign with previous secret and previous kid
      const previousKeyConfig = {
        currentSecret: previousSecret,
        currentKid: 'key-2026-prev',
      };
      const token = await signJoseAccessToken(
        {
          sub: 'v-stall-02',
          phone: '9876543211',
          businessName: 'Tea Stall',
          role: 'cashier',
          edition: 'local',
        },
        previousKeyConfig
      );

      // Verifier accepts it via kid lookup
      const verified = await verifyJoseAccessToken(token, config);
      expect(verified.sub).toBe('v-stall-02');
      expect(verified.role).toBe('cashier');
    });

    it('rejects tokens signed with unknown secret or forged kid', async () => {
      const config = {
        currentSecret,
        currentKid: 'key-2026-curr',
      };

      const forgedToken = await signJoseAccessToken(
        {
          sub: 'v-hacker',
          phone: '9999999999',
          businessName: 'Fake Stall',
          role: 'superadmin',
          edition: 'cloud',
        },
        { currentSecret: 'attacker-unauthorized-random-secret-key-32b!!', currentKid: 'key-2026-curr' }
      );

      await expect(verifyJoseAccessToken(forgedToken, config)).rejects.toThrow();
    });

    it('rejects tokens when algorithm is manipulated (no alg negotiation permitted)', async () => {
      const config = {
        currentSecret,
        currentKid: 'key-2026-curr',
      };

      // Forged token with 'none' or different alg
      const forgedNone = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJoYWNrZXIifQ.';
      await expect(verifyJoseAccessToken(forgedNone, config)).rejects.toThrow();
    });

    it('throws error if secret is shorter than 32 characters or default', () => {
      expect(() =>
        getJwtKeyRotationConfig({ JWT_SECRET: 'short-secret', JWT_SECRET_PREVIOUS: '' })
      ).toThrow(/32 bytes|weak/i);

      expect(() =>
        getJwtKeyRotationConfig({ JWT_SECRET: 'frose-street-default-jwt-secret-dev-2026-change-in-prod-xyz', JWT_SECRET_PREVIOUS: '' })
      ).toThrow(/default/i);
    });
  });

  describe('2. Ed25519 (EdDSA) Offline License Token', () => {
    it('generates an Ed25519 signed license token that verifies offline using ONLY the public key', async () => {
      const payload = {
        vendorId: 'v-stall-01',
        businessName: 'Royal Dosa Stall',
        plan: 'cloud' as const,
        periodStart: '2026-01-01T00:00:00.000Z',
        periodEnd: '2026-12-31T23:59:59.000Z',
        status: 'active' as const,
      };

      // Server signs with private key
      const licenseToken = await generateEd25519LicenseToken(payload, edPrivateKey);
      expect(licenseToken).toBeDefined();

      // Offline client validates with public key ONLY
      const verified = await verifyEd25519LicenseToken(licenseToken, edPublicKey);
      expect(verified.valid).toBe(true);
      expect(verified.payload?.vendorId).toBe('v-stall-01');
      expect(verified.payload?.businessName).toBe('Royal Dosa Stall');
    });

    it('rejects tampered Ed25519 license tokens', async () => {
      const payload = {
        vendorId: 'v-stall-01',
        businessName: 'Royal Dosa Stall',
        plan: 'cloud' as const,
        periodStart: '2026-01-01T00:00:00.000Z',
        periodEnd: '2026-12-31T23:59:59.000Z',
        status: 'active' as const,
      };

      const licenseToken = await generateEd25519LicenseToken(payload, edPrivateKey);
      const parts = licenseToken.split('.');
      // Tamper with payload
      const tampered = parts[0] + '.' + Buffer.from(JSON.stringify({ ...payload, vendorId: 'hacked' })).toString('base64url') + '.' + parts[2];

      const res = await verifyEd25519LicenseToken(tampered, edPublicKey);
      expect(res.valid).toBe(false);
    });
  });
});
