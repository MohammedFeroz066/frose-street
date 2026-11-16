import { buildApp } from './app.js';
import { loadConfig } from './config/env.js';

async function main() {
  const config = loadConfig();
  const app = await buildApp({ logger: true });

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
