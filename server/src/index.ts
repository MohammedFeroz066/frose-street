import { buildApp } from './app.js';
import { loadConfig } from './config/env.js';
import { closeDatabase } from './db/database.js';

async function main() {
  const config = loadConfig();
  const app = await buildApp({ logger: true });

  const shutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
    try {
      await app.close();
      console.log('🔌 Fastify HTTP and WebSocket server closed.');
      await closeDatabase();
      console.log('🗄️ Database connection pool drained.');
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    console.log(`🚀 FROSE Street server running at http://${config.HOST}:${config.PORT}`);
    console.log(`🌐 Public domain: https://street.frostech.com`);
    console.log(`🧾 Billing Portal: http://localhost:${config.PORT}/billing`);
    console.log(`📦 Packaging Portal: http://localhost:${config.PORT}/packaging`);
    console.log(`🍳 Kitchen Portal: http://localhost:${config.PORT}/kitchen`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

main();
