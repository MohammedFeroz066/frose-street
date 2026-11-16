import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('expenses')
    .addColumn('category', 'varchar(50)', (col) => col.defaultTo('general'))
    .execute();

  await db.schema
    .alterTable('expenses')
    .addColumn('payment_method', 'varchar(20)', (col) => col.defaultTo('cash'))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('expenses')
    .dropColumn('payment_method')
    .execute();

  await db.schema
    .alterTable('expenses')
    .dropColumn('category')
    .execute();
}
