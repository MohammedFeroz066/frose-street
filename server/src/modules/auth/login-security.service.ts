export interface LockStatus {
  isLocked: boolean;
  remainingSeconds: number;
}

export interface FailedAttemptResult {
  isLocked: boolean;
  lockDurationSeconds: number;
  attemptsRemaining: number;
  consecutiveFailures: number;
}

interface PhoneSecurityRecord {
  consecutiveFailures: number;
  lockedUntil: number;
  lockLevel: number;
}

/**
 * LoginSecurityService
 * Progressive rate limiting and stepped lockout protection for mobile credentials.
 * 3 consecutive failed password attempts triggers 60s lockout.
 * Subsequent failures scale to 300s (5m) and 900s (15m).
 */
export class LoginSecurityService {
  private static store = new Map<string, PhoneSecurityRecord>();

  /**
   * Check if a phone number is currently in an active lockout window
   */
  static checkLock(phone: string): LockStatus {
    const cleaned = phone.replace(/\D/g, '');
    const record = this.store.get(cleaned);

    if (!record) {
      return { isLocked: false, remainingSeconds: 0 };
    }

    const now = Date.now();
    if (now < record.lockedUntil) {
      const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
      return { isLocked: true, remainingSeconds };
    }

    return { isLocked: false, remainingSeconds: 0 };
  }

  /**
   * Record a failed password attempt and compute stepped backoff
   */
  static recordFailedAttempt(phone: string): FailedAttemptResult {
    const cleaned = phone.replace(/\D/g, '');
    const now = Date.now();
    let record = this.store.get(cleaned);

    if (!record) {
      record = { consecutiveFailures: 0, lockedUntil: 0, lockLevel: 0 };
      this.store.set(cleaned, record);
    }

    record.consecutiveFailures += 1;

    // Check thresholds: 3 fails = 60s, 4 fails = 300s, 5+ fails = 900s
    if (record.consecutiveFailures === 3) {
      const lockDurationSeconds = 60; // 1 minute
      record.lockedUntil = now + lockDurationSeconds * 1000;
      record.lockLevel = 1;
      return {
        isLocked: true,
        lockDurationSeconds,
        attemptsRemaining: 0,
        consecutiveFailures: record.consecutiveFailures,
      };
    } else if (record.consecutiveFailures === 4) {
      const lockDurationSeconds = 300; // 5 minutes
      record.lockedUntil = now + lockDurationSeconds * 1000;
      record.lockLevel = 2;
      return {
        isLocked: true,
        lockDurationSeconds,
        attemptsRemaining: 0,
        consecutiveFailures: record.consecutiveFailures,
      };
    } else if (record.consecutiveFailures >= 5) {
      const lockDurationSeconds = 900; // 15 minutes
      record.lockedUntil = now + lockDurationSeconds * 1000;
      record.lockLevel = 3;
      return {
        isLocked: true,
        lockDurationSeconds,
        attemptsRemaining: 0,
        consecutiveFailures: record.consecutiveFailures,
      };
    }

    return {
      isLocked: false,
      lockDurationSeconds: 0,
      attemptsRemaining: Math.max(0, 3 - record.consecutiveFailures),
      consecutiveFailures: record.consecutiveFailures,
    };
  }

  /**
   * Reset security state upon successful authentication
   */
  static recordSuccess(phone: string): void {
    const cleaned = phone.replace(/\D/g, '');
    this.store.delete(cleaned);
  }

  /**
   * Helper for unit tests to reset memory store
   */
  static resetForTesting(): void {
    this.store.clear();
  }
}
