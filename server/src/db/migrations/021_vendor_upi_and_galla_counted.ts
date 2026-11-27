import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE vendors
      ADD COLUMN IF NOT EXISTS upi_id VARCHAR(120),
      ADD COLUMN IF NOT EXISTS payee_name VARCHAR(120);
  `.execute(db);

  await sql`
    ALTER TABLE daily_summaries
      ADD COLUMN IF NOT EXISTS counted_cash_paise BIGINT;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE daily_summaries
      DROP COLUMN IF EXISTS counted_cash_paise;
  `.execute(db);

  await sql`
    ALTER TABLE vendors
      DROP COLUMN IF EXISTS payee_name,
      DROP COLUMN IF EXISTS upi_id;
  `.execute(db);
}
