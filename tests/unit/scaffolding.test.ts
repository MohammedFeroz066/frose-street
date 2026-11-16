import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../server/src/app.js';
import { loadConfig } from '../../server/src/config/env.js';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';

describe('Phase 1 Scaffolding: Project Structure & Core Health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('TEST 1: Directory Structure & Static Files', () => {
    it('should have client, server, and shared directories', () => {
      const root = path.resolve(__dirname, '../../');
      expect(fs.existsSync(path.join(root, 'server'))).toBe(true);
      expect(fs.existsSync(path.join(root, 'client'))).toBe(true);
      expect(fs.existsSync(path.join(root, 'shared'))).toBe(true);
    });

    it('should have index.html with the 3 portal cards', () => {
      const htmlPath = path.resolve(__dirname, '../../client/index.html');
      expect(fs.existsSync(htmlPath)).toBe(true);

      const htmlContent = fs.readFileSync(htmlPath, 'utf8');
      expect(htmlContent).toContain('1. BILLING COUNTER');
      expect(htmlContent).toContain('2. PACKAGING & SERVING');
      expect(htmlContent).toContain('3. KITCHEN DISPLAY');
      expect(htmlContent).toContain('btn-billing');
      expect(htmlContent).toContain('btn-packaging');
      expect(htmlContent).toContain('btn-kitchen');
    });

    it('should have PWA manifest and Service Worker', () => {
      const manifestPath = path.resolve(__dirname, '../../client/manifest.json');
      const swPath = path.resolve(__dirname, '../../client/sw.js');
      expect(fs.existsSync(manifestPath)).toBe(true);
      expect(fs.existsSync(swPath)).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(manifest.name).toBe('FROSE Street');
      expect(manifest.display).toBe('standalone');
    });

    it('should have style.css with touch target >= 60px requirement', () => {
      const cssPath = path.resolve(__dirname, '../../client/css/style.css');
      expect(fs.existsSync(cssPath)).toBe(true);

      const cssContent = fs.readFileSync(cssPath, 'utf8');
      expect(cssContent).toContain('min-height: 84px');
      expect(cssContent).toContain('--bg-primary');
    });
  });

  describe('TEST 2: Environment Configuration', () => {
    it('should load default environment configuration', () => {
      const config = loadConfig();
      expect(config.PORT).toBeDefined();
      expect(config.HOST).toBeDefined();
      expect(config.DATABASE_URL).toBeDefined();
      expect(config.JWT_SECRET).toBeDefined();
      expect(Array.isArray(config.CORS_ORIGIN)).toBe(true);
    });
  });

  describe('TEST 3: Health Check Endpoint', () => {
    it('GET /health should return 200 with service info and all 3 portals', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);
      expect(json.status).toBe('ok');
      expect(json.service).toBe('frose-street');
      expect(json.portals.billing).toBe('/billing');
      expect(json.portals.packaging).toBe('/packaging');
      expect(json.portals.kitchen).toBe('/kitchen');
    });
  });

  describe('TEST 4: Portal Endpoints Availability', () => {
    it('GET /billing should respond with 200', async () => {
      const res = await app.inject({ method: 'GET', url: '/billing' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).portal).toBe('billing');
    });

    it('GET /packaging should respond with 200', async () => {
      const res = await app.inject({ method: 'GET', url: '/packaging' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).portal).toBe('packaging');
    });

    it('GET /kitchen should respond with 200', async () => {
      const res = await app.inject({ method: 'GET', url: '/kitchen' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).portal).toBe('kitchen');
    });
  });
});
