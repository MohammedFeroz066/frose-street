import { getDatabase, closeDatabase } from './database.js';
import { migrateToLatest, migrateDown } from './migrator.js';

async function main() {
  const command = process.argv[2] || 'latest';
  const db = getDatabase();

  try {
    if (command === 'down') {
      console.log('⏪ Rolling back last migration...');
      await migrateDown(db);
    } else {
      console.log('🚀 Running migrations to latest...');
      await migrateToLatest(db);
    }
    console.log('✨ Database migration command finished successfully.');
  } catch (err) {
    console.error('Migration CLI error:', err);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

main();
