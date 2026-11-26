import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { closeDatabase } from '../../server/src/db/database.js';

const rootDir = path.resolve(__dirname, '../..');

describe('OPS-01: Production Healthcheck, Deployment Pack & SW Manifest', () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = null;
    }
    await closeDatabase();
  });

  it('GET /health/ready returns 200 when database is healthy', async () => {
    process.env.USE_MEMORY_DB = 'true';
    app = await buildApp({ logger: false });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.db).toBe('connected');
    expect(typeof body.timestamp).toBe('string');
  });

  it('GET /health/ready returns 503 without leaking internal DB credentials when DB fails', async () => {
    process.env.USE_MEMORY_DB = 'true';
    app = await buildApp({ logger: false });
    await app.ready();

    // Simulate unreachable DB by attaching a failing health probe hook on the app instance
    (app as any).froseHealthProbe = async () => {
      throw new Error('ECONNREFUSED postgres://secret_user:secret_pass@10.0.0.5:5432/frose_street');
    };

    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.status).toBe('error');
    expect(body.db).toBe('unavailable');
    expect(res.body).not.toContain('secret_pass');
    expect(res.body).not.toContain('ECONNREFUSED');
  });

  it('includes all required production deployment artifacts without hardcoded secrets', () => {
    const requiredFiles = [
      'Dockerfile',
      'docker-compose.prod.yml',
      'deploy/Caddyfile',
      'deploy/backup-pg.sh',
      'DEPLOY.md',
    ];

    for (const rel of requiredFiles) {
      const fullPath = path.join(rootDir, rel);
      expect(fs.existsSync(fullPath), `Missing deployment artifact: ${rel}`).toBe(true);
      const content = fs.readFileSync(fullPath, 'utf8');
      expect(content.length).toBeGreaterThan(50);
      expect(content).not.toMatch(/sk_live_|ghp_|BEGIN PRIVATE KEY|frose_street_secure_pass/);
    }
  });
});
