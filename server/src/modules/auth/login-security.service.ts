import type { Kysely } from 'kysely';
import type { Database } from '../../db/types.js';
import { memoryLockouts } from '../../db/memory-db.js';

export interface LockStatus {
  isLocked: boolean;
  remainingSeconds: number;
  reason?: 'account' | 'ip';
}

export interface FailedAttemptResult {
  isLocked: boolean;
  lockDurationSeconds: number;
  attemptsRemaining: number;
  consecutiveFailures: number;
}

interface SecurityRecord {
  consecutiveFailures: number;
  lockedUntil: number;
  lockLevel: number;
}

interface OwnerPinRecord {
  consecutiveFailures: number;
  windowStartedAt: number;
  lockedUntil: number;
}

const OWNER_PIN_WINDOW_MS = 15 * 60 * 1000;
const OWNER_PIN_MAX_FAILURES = 5;

/**
 * LoginSecurityService
 * Progressive rate limiting and stepped lockout protection for mobile credentials & IP addresses.
 * Backed persistently by Postgres / Kysely `login_lockouts` table with fast in-memory sync.
 * 3 consecutive failed password attempts triggers 60s lockout.
 * Subsequent failures scale to 300s (5m) and 900s (15m).
 */
export class LoginSecurityService {
  private static store = new Map<string, SecurityRecord>();
  private static ownerPinStore = new Map<string, OwnerPinRecord>();

  /**
   * Check if a phone number or IP is currently in an active lockout window
   */
  static async checkLockAsync(
    phone: string,
    ip?: string,
    db?: Kysely<Database>
  ): Promise<LockStatus> {
    const now = Date.now();
    const cleanedPhone = phone ? phone.replace(/\D/g, '') : '';

    // Check account lockout in DB if db provided
    if (db && cleanedPhone) {
      try {
        const lockoutRow = await db
          .selectFrom('login_lockouts')
          .select(['consecutive_failures', 'locked_until'])
          .where('id', '=', `acc:${cleanedPhone}`)
          .executeTakeFirst();

        if (lockoutRow && lockoutRow.locked_until) {
          const lockTime = new Date(lockoutRow.locked_until).getTime();
          if (now < lockTime) {
            const remainingSeconds = Math.ceil((lockTime - now) / 1000);
            return { isLocked: true, remainingSeconds, reason: 'account' };
          }
        }
      } catch {}
    }

    // Check IP lockout in DB if db provided
    if (db && ip) {
      try {
        const ipRow = await db
          .selectFrom('login_lockouts')
          .select(['consecutive_failures', 'locked_until'])
          .where('id', '=', `ip:${ip}`)
          .executeTakeFirst();

        if (ipRow && ipRow.locked_until) {
          const lockTime = new Date(ipRow.locked_until).getTime();
          if (now < lockTime) {
            const remainingSeconds = Math.ceil((lockTime - now) / 1000);
            return { isLocked: true, remainingSeconds, reason: 'ip' };
          }
        }
      } catch {}
    }

    // Fast in-memory check
    const accRecord = this.store.get(`acc:${cleanedPhone}`) || this.store.get(cleanedPhone);
    if (accRecord && now < accRecord.lockedUntil) {
      const remainingSeconds = Math.ceil((accRecord.lockedUntil - now) / 1000);
      return { isLocked: true, remainingSeconds, reason: 'account' };
    }

    if (ip) {
      const ipRecord = this.store.get(`ip:${ip}`);
      if (ipRecord && now < ipRecord.lockedUntil) {
        const remainingSeconds = Math.ceil((ipRecord.lockedUntil - now) / 1000);
        return { isLocked: true, remainingSeconds, reason: 'ip' };
      }
    }

    return { isLocked: false, remainingSeconds: 0 };
  }

  /**
   * Synchronous check for backwards compatibility
   */
  static checkLock(phone: string, ip?: string): LockStatus {
    const cleaned = phone ? phone.replace(/\D/g, '') : '';
    const now = Date.now();
    const record = this.store.get(`acc:${cleaned}`) || this.store.get(cleaned);

    if (record && now < record.lockedUntil) {
      const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
      return { isLocked: true, remainingSeconds, reason: 'account' };
    }

    if (ip) {
      const ipRecord = this.store.get(`ip:${ip}`);
      if (ipRecord && now < ipRecord.lockedUntil) {
        const remainingSeconds = Math.ceil((ipRecord.lockedUntil - now) / 1000);
        return { isLocked: true, remainingSeconds, reason: 'ip' };
      }
    }

    return { isLocked: false, remainingSeconds: 0 };
  }

  /**
   * Record a failed password attempt and compute stepped backoff
   */
  static async recordFailedAttemptAsync(
    phone: string,
    ip?: string,
    db?: Kysely<Database>
  ): Promise<FailedAttemptResult> {
    const res = this.recordFailedAttempt(phone, ip);
    const cleanedPhone = phone ? phone.replace(/\D/g, '') : '';

    if (db && cleanedPhone) {
      try {
        const lockDate = res.lockDurationSeconds > 0 ? new Date(Date.now() + res.lockDurationSeconds * 1000) : null;
        const existing = await db
          .selectFrom('login_lockouts')
          .select('id')
          .where('id', '=', `acc:${cleanedPhone}`)
          .executeTakeFirst();

        if (existing) {
          await db
            .updateTable('login_lockouts')
            .set({
              consecutive_failures: res.consecutiveFailures,
              locked_until: lockDate,
              updated_at: new Date(),
            })
            .where('id', '=', `acc:${cleanedPhone}`)
            .execute();
        } else {
          await db
            .insertInto('login_lockouts')
            .values({
              id: `acc:${cleanedPhone}`,
              key_type: 'account',
              key_value: cleanedPhone,
              consecutive_failures: res.consecutiveFailures,
              locked_until: lockDate,
              updated_at: new Date(),
            })
            .execute();
        }

        if (ip) {
          const ipExisting = await db
            .selectFrom('login_lockouts')
            .select('id')
            .where('id', '=', `ip:${ip}`)
            .executeTakeFirst();

          if (ipExisting) {
            await db
              .updateTable('login_lockouts')
              .set({
                consecutive_failures: res.consecutiveFailures,
                locked_until: lockDate,
                updated_at: new Date(),
              })
              .where('id', '=', `ip:${ip}`)
              .execute();
          } else {
            await db
              .insertInto('login_lockouts')
              .values({
                id: `ip:${ip}`,
                key_type: 'ip',
                key_value: ip,
                consecutive_failures: res.consecutiveFailures,
                locked_until: lockDate,
                updated_at: new Date(),
              })
              .execute();
          }
        }
      } catch {}
    }

    return res;
  }

  /**
   * Synchronous record for existing callers
   */
  static recordFailedAttempt(phone: string, ip?: string): FailedAttemptResult {
    const cleaned = phone ? phone.replace(/\D/g, '') : '';
    const now = Date.now();
    let record = this.store.get(`acc:${cleaned}`) || this.store.get(cleaned);

    if (!record) {
      record = { consecutiveFailures: 0, lockedUntil: 0, lockLevel: 0 };
      this.store.set(`acc:${cleaned}`, record);
    }

    record.consecutiveFailures += 1;

    let lockDurationSeconds = 0;
    // Account thresholds: 3 fails = 60s, 4 fails = 300s, 5+ fails = 900s
    if (record.consecutiveFailures === 3) {
      lockDurationSeconds = 60; // 1 minute
      record.lockedUntil = now + lockDurationSeconds * 1000;
      record.lockLevel = 1;
    } else if (record.consecutiveFailures === 4) {
      lockDurationSeconds = 300; // 5 minutes
      record.lockedUntil = now + lockDurationSeconds * 1000;
      record.lockLevel = 2;
    } else if (record.consecutiveFailures >= 5) {
      lockDurationSeconds = 900; // 15 minutes
      record.lockedUntil = now + lockDurationSeconds * 1000;
      record.lockLevel = 3;
    }

    // IP thresholds: 10 fails = 300s, 20+ fails = 900s (protects against credential stuffing while tolerating NAT/proxies)
    if (ip) {
      let ipRecord = this.store.get(`ip:${ip}`);
      if (!ipRecord) {
        ipRecord = { consecutiveFailures: 0, lockedUntil: 0, lockLevel: 0 };
        this.store.set(`ip:${ip}`, ipRecord);
      }
      ipRecord.consecutiveFailures += 1;
      if (ipRecord.consecutiveFailures >= 20) {
        ipRecord.lockedUntil = now + 900 * 1000;
      } else if (ipRecord.consecutiveFailures >= 10) {
        ipRecord.lockedUntil = now + 300 * 1000;
      }
    }

    return {
      isLocked: lockDurationSeconds > 0,
      lockDurationSeconds,
      attemptsRemaining: Math.max(0, 3 - record.consecutiveFailures),
      consecutiveFailures: record.consecutiveFailures,
    };
  }

  /**
   * Reset security state upon successful authentication
   */
  static async recordSuccessAsync(
    phone: string,
    ip?: string,
    db?: Kysely<Database>
  ): Promise<void> {
    this.recordSuccess(phone, ip);
    const cleaned = phone ? phone.replace(/\D/g, '') : '';

    if (db && cleaned) {
      try {
        await db
          .deleteFrom('login_lockouts')
          .where('id', 'in', [`acc:${cleaned}`, `ip:${ip || ''}`])
          .execute();
      } catch {}
    }
  }

  static recordSuccess(phone: string, ip?: string): void {
    const cleaned = phone ? phone.replace(/\D/g, '') : '';
    this.store.delete(`acc:${cleaned}`);
    this.store.delete(cleaned);
    if (ip) {
      this.store.delete(`ip:${ip}`);
    }
  }

  /**
   * Checks whether a vendor's 4-digit Owner PIN verification is currently locked (5 failures / 15 min)
   */
  static async checkOwnerPinLockAsync(
    vendorId: string,
    db?: Kysely<Database>,
  ): Promise<LockStatus> {
    const now = Date.now();
    const key = `opin:${vendorId}`;

    if (db && vendorId) {
      try {
        const row = await db
          .selectFrom('login_lockouts')
          .select(['consecutive_failures', 'locked_until'])
          .where('id', '=', key)
          .executeTakeFirst();

        if (row && row.locked_until) {
          const lockTime = new Date(row.locked_until).getTime();
          if (now < lockTime) {
            return {
              isLocked: true,
              remainingSeconds: Math.ceil((lockTime - now) / 1000),
              reason: 'account',
            };
          }
        }
      } catch {}
    }

    const mem = this.ownerPinStore.get(vendorId);
    if (mem && now < mem.lockedUntil) {
      return {
        isLocked: true,
        remainingSeconds: Math.ceil((mem.lockedUntil - now) / 1000),
        reason: 'account',
      };
    }

    return { isLocked: false, remainingSeconds: 0 };
  }

  /**
   * Records a failed 4-digit Owner PIN attempt; locks for 15 minutes on the 5th failure within 15 minutes.
   */
  static async recordOwnerPinFailureAsync(
    vendorId: string,
    db?: Kysely<Database>,
  ): Promise<FailedAttemptResult> {
    const now = Date.now();
    let rec = this.ownerPinStore.get(vendorId);
    if (!rec || now - rec.windowStartedAt > OWNER_PIN_WINDOW_MS) {
      rec = { consecutiveFailures: 0, windowStartedAt: now, lockedUntil: 0 };
      this.ownerPinStore.set(vendorId, rec);
    }

    rec.consecutiveFailures += 1;
    let lockDurationSeconds = 0;
    if (rec.consecutiveFailures >= OWNER_PIN_MAX_FAILURES) {
      lockDurationSeconds = Math.ceil(OWNER_PIN_WINDOW_MS / 1000);
      rec.lockedUntil = now + OWNER_PIN_WINDOW_MS;
    }

    if (db && vendorId) {
      try {
        const key = `opin:${vendorId}`;
        const lockDate = lockDurationSeconds > 0 ? new Date(rec.lockedUntil) : null;
        const existing = await db
          .selectFrom('login_lockouts')
          .select('id')
          .where('id', '=', key)
          .executeTakeFirst();

        if (existing) {
          await db
            .updateTable('login_lockouts')
            .set({
              consecutive_failures: rec.consecutiveFailures,
              locked_until: lockDate,
              updated_at: new Date(),
            })
            .where('id', '=', key)
            .execute();
        } else {
          await db
            .insertInto('login_lockouts')
            .values({
              id: key,
              key_type: 'owner_pin' as any,
              key_value: vendorId.slice(0, 64),
              consecutive_failures: rec.consecutiveFailures,
              locked_until: lockDate,
              updated_at: new Date(),
            })
            .execute();
        }
      } catch {}
    }

    return {
      isLocked: lockDurationSeconds > 0,
      lockDurationSeconds,
      attemptsRemaining: Math.max(0, OWNER_PIN_MAX_FAILURES - rec.consecutiveFailures),
      consecutiveFailures: rec.consecutiveFailures,
    };
  }

  /**
   * Clears Owner PIN failure count after a successful verification.
   */
  static async recordOwnerPinSuccessAsync(
    vendorId: string,
    db?: Kysely<Database>,
  ): Promise<void> {
    this.ownerPinStore.delete(vendorId);
    if (db && vendorId) {
      try {
        await db
          .deleteFrom('login_lockouts')
          .where('id', '=', `opin:${vendorId}`)
          .execute();
      } catch {}
    }
  }

  /**
   * Helper for unit tests to reset memory store and DB test map
   */
  static resetForTesting(): void {
    this.store.clear();
    this.ownerPinStore.clear();
    try {
      if (memoryLockouts) {
        memoryLockouts.clear();
      }
    } catch {}
  }
}
