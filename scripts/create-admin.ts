import 'dotenv/config';
import { getDatabase, closeDatabase } from '../server/src/db/database.js';
import { withSuperadminContext } from '../server/src/db/rls-context.js';
import { hashPassword } from '../server/src/utils/crypto.js';
import { randomUUID } from 'node:crypto';

export async function createAdminFromEnv() {
  const phone = process.env.ADMIN_PHONE ? process.env.ADMIN_PHONE.replace(/\D/g, '') : '';
  const password = process.env.ADMIN_PASSWORD || '';
  const ownerName = process.env.ADMIN_NAME || 'Super Admin';
  const businessName = process.env.ADMIN_BUSINESS_NAME || 'FROSE Platform HQ';

  if (!phone || phone.length !== 10) {
    throw new Error('ADMIN_PHONE must be a valid 10-digit mobile number set in environment');
  }

  if (!password || password.length < 10) {
    throw new Error('ADMIN_PASSWORD must be at least 10 characters long');
  }

  // Strong password checks: uppercase, lowercase, digit, symbol
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  if (!hasUpper || !hasLower || !hasDigit || !hasSpecial) {
    throw new Error('ADMIN_PASSWORD must contain uppercase, lowercase, digit, and special character');
  }

  const rootDb = getDatabase();

  try {
    const passwordHash = await hashPassword(password);
    return await withSuperadminContext(async (db) => {
      const existing = await db
        .selectFrom('vendors')
        .selectAll()
        .where('phone', '=', phone)
        .executeTakeFirst();

      if (existing) {
        await db
          .updateTable('vendors')
          .set({
            password_hash: passwordHash,
            is_superadmin: true,
            owner_name: ownerName,
            business_name: businessName,
            updated_at: new Date().toISOString(),
          })
          .where('id', '=', existing.id)
          .execute();

        console.log(`[Admin CLI] Updated existing vendor ${existing.id} (${phone.slice(0, 3)}****${phone.slice(-3)}) to Super Admin.`);
        return { id: existing.id, phone, updated: true };
      } else {
        const vendorId = randomUUID();
        await db
          .insertInto('vendors')
          .values({
            id: vendorId,
            phone,
            business_name: businessName,
            owner_name: ownerName,
            business_type: 'Platform Management',
            city: 'Hyderabad',
            edition: 'cloud',
            subscription_status: 'active',
            subscription_expires_at: new Date(Date.now() + 3650 * 24 * 3600 * 1000).toISOString() as any,
            daily_token_counter: 0,
            token_reset_date: new Date().toISOString().slice(0, 10),
            password_hash: passwordHash,
            is_superadmin: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .execute();

        console.log(`[Admin CLI] Created new Super Admin vendor ${vendorId} (${phone.slice(0, 3)}****${phone.slice(-3)}).`);
        return { id: vendorId, phone, updated: false };
      }
    }, rootDb);
  } finally {
    await closeDatabase();
  }
}

// Only run automatically if executed directly from CLI
if (process.argv[1] && process.argv[1].endsWith('create-admin.ts')) {
  createAdminFromEnv()
    .then(() => {
      console.log('✅ Admin creation finished successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Admin creation failed:', err.message);
      process.exit(1);
    });
}
