import crypto from 'node:crypto';
import type { Kysely } from 'kysely';
import type { Database } from '../../db/types.js';
import { AppError } from '../../errors/app-error.js';

export interface RefreshTokenResult {
  refreshToken: string;
  familyId: string;
  vendorId: string;
}

export class RefreshTokenService {
  /**
   * Hashes an opaque token using SHA-256 before database storage or lookup
   */
  static hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Creates a new random opaque refresh token and stores its hash in DB
   */
  static async createRefreshToken(
    db: Kysely<Database>,
    vendorId: string,
    existingFamilyId?: string
  ): Promise<RefreshTokenResult> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const familyId = existingFamilyId || crypto.randomUUID();
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 86400 * 1000); // 30 days

    await db
      .insertInto('refresh_tokens')
      .values({
        id,
        vendor_id: vendorId,
        token_hash: tokenHash,
        family_id: familyId,
        is_revoked: false,
        expires_at: expiresAt,
        created_at: new Date(),
      })
      .execute();

    return {
      refreshToken: rawToken,
      familyId,
      vendorId,
    };
  }

  /**
   * Rotates a refresh token.
   * If a token is reused (already revoked), immediately revokes the ENTIRE token family.
   */
  static async rotateRefreshToken(
    db: Kysely<Database>,
    rawToken: string
  ): Promise<RefreshTokenResult> {
    if (!rawToken || typeof rawToken !== 'string') {
      throw AppError.unauthorized('Refresh token is required', 'MISSING_REFRESH_TOKEN');
    }

    const tokenHash = this.hashToken(rawToken);

    // Look up the token by hash
    const record = await db
      .selectFrom('refresh_tokens')
      .selectAll()
      .where('token_hash', '=', tokenHash)
      .executeTakeFirst();

    if (!record) {
      throw AppError.unauthorized('Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
    }

    // Reuse detection: If token was already revoked/used, someone is attempting to reuse it!
    if (record.is_revoked === true) {
      // REVOKE ENTIRE FAMILY
      await db
        .updateTable('refresh_tokens')
        .set({ is_revoked: true })
        .where('family_id', '=', record.family_id)
        .execute();

      throw AppError.unauthorized(
        'Invalid or reused refresh token. All active sessions have been revoked for security.',
        'REFRESH_TOKEN_REUSE_DETECTED'
      );
    }

    // Check expiration
    const expiry = new Date(record.expires_at).getTime();
    if (Date.now() > expiry) {
      await db
        .updateTable('refresh_tokens')
        .set({ is_revoked: true })
        .where('id', '=', record.id)
        .execute();
      throw AppError.unauthorized('Refresh token has expired', 'EXPIRED_REFRESH_TOKEN');
    }

    // Mark current token as revoked / consumed
    await db
      .updateTable('refresh_tokens')
      .set({ is_revoked: true })
      .where('id', '=', record.id)
      .execute();

    // Issue new token in the SAME family (rotation)
    return this.createRefreshToken(db, record.vendor_id, record.family_id);
  }

  /**
   * Revokes an entire token family upon logout
   */
  static async revokeFamily(
    db: Kysely<Database>,
    rawToken: string
  ): Promise<void> {
    if (!rawToken) return;

    const tokenHash = this.hashToken(rawToken);
    const record = await db
      .selectFrom('refresh_tokens')
      .select(['family_id'])
      .where('token_hash', '=', tokenHash)
      .executeTakeFirst();

    if (record && record.family_id) {
      await db
        .updateTable('refresh_tokens')
        .set({ is_revoked: true })
        .where('family_id', '=', record.family_id)
        .execute();
    }
  }
}
