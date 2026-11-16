import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../server/src/app.js';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';

describe('Phase 11 Acceptance: PWA Shell, Formal Two-Color Light Design System & Landing Hub', () => {
  let app: FastifyInstance;
  const clientDir = path.resolve(__dirname, '../../client');

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('TEST 1: Web App Manifest & PWA Configuration', () => {
    it('should have a valid, well-formed manifest.json on disk', () => {
      const manifestPath = path.join(clientDir, 'manifest.json');
      expect(fs.existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(manifest.name).toBe('FROSE Street');
      expect(manifest.short_name).toBe('FROSE Street');
      expect(manifest.display).toBe('standalone');
      expect(manifest.start_url).toBe('/');
    });

    it('manifest must use the formal light palette (Pure White background & Soft Slate theme)', () => {
      const manifestPath = path.join(clientDir, 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      expect(manifest.background_color.toUpperCase()).toBe('#FFFFFF');
      expect(manifest.theme_color.toUpperCase()).toBe('#F8FAFC');
    });

    it('manifest must declare 192x192 and 512x512 icons present in client/icons', () => {
      const manifestPath = path.join(clientDir, 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      const sizes = manifest.icons.map((i: any) => i.sizes);
      expect(sizes).toContain('192x192');
      expect(sizes).toContain('512x512');

      expect(fs.existsSync(path.join(clientDir, 'icons/icon-192.png'))).toBe(true);
      expect(fs.existsSync(path.join(clientDir, 'icons/icon-512.png'))).toBe(true);
    });
  });

  describe('TEST 2: Service Worker & Offline PWA Assets', () => {
    it('service worker sw.js must pre-cache core static assets', () => {
      const swPath = path.join(clientDir, 'sw.js');
      expect(fs.existsSync(swPath)).toBe(true);

      const swContent = fs.readFileSync(swPath, 'utf8');
      expect(swContent).toContain('/index.html');
      expect(swContent).toContain('/css/style.css');
      expect(swContent).toContain('/js/app.js');
      expect(swContent).toContain('/manifest.json');
    });

    it('service worker must bypass cache for API, WebSocket and health endpoints', () => {
      const swContent = fs.readFileSync(path.join(clientDir, 'sw.js'), 'utf8');
      expect(swContent).toContain('/api/');
      expect(swContent).toContain('/health');
      expect(swContent).toContain('/ws');
    });
  });

  describe('TEST 3: Formal Two-Color Design System Tokens', () => {
    it('style.css must define Executive Navy (#0F172A) and Saffron Amber (#D97706)', () => {
      const cssPath = path.join(clientDir, 'css/style.css');
      expect(fs.existsSync(cssPath)).toBe(true);

      const css = fs.readFileSync(cssPath, 'utf8');
      expect(css).toContain('#0F172A');
      expect(css).toContain('#D97706');
      expect(css).toContain('--bg-primary: #F8FAFC');
      expect(css).toContain('--bg-surface: #FFFFFF');
    });

    it('portal buttons must meet the mandatory 80px+ vertical touch target requirement', () => {
      const css = fs.readFileSync(path.join(clientDir, 'css/style.css'), 'utf8');
      expect(css).toContain('min-height: 84px');
    });

    it('numpad keypad must define tactile 64px-72px dimensions for zero-keyboard PIN entry', () => {
      const css = fs.readFileSync(path.join(clientDir, 'css/style.css'), 'utf8');
      expect(css).toContain('.numpad-key');
      expect(css).toContain('height: 64px');
    });
  });

  describe('TEST 4: Landing Page Structure & The 3 Giant Portal Buttons', () => {
    it('index.html must contain all 3 primary portal buttons with correct routes', () => {
      const htmlPath = path.join(clientDir, 'index.html');
      expect(fs.existsSync(htmlPath)).toBe(true);

      const html = fs.readFileSync(htmlPath, 'utf8');
      expect(html).toContain('1. BILLING COUNTER');
      expect(html).toContain('2. PACKAGING & SERVING');
      expect(html).toContain('3. KITCHEN DISPLAY');

      expect(html).toContain('id="btn-billing"');
      expect(html).toContain('id="btn-packaging"');
      expect(html).toContain('id="btn-kitchen"');

      expect(html).toContain('href="/billing"');
      expect(html).toContain('href="/packaging"');
      expect(html).toContain('href="/kitchen"');
    });

    it('index.html must include the daily Galla summary glance strip', () => {
      const html = fs.readFileSync(path.join(clientDir, 'index.html'), 'utf8');
      expect(html).toContain('id="galla-drawer"');
      expect(html).toContain('id="galla-total-sales"');
      expect(html).toContain('id="galla-cash-sales"');
      expect(html).toContain('id="galla-upi-sales"');
      expect(html).toContain('Today\'s Daily Summary');
    });

    it('index.html must contain the Quick PIN numpad modal with 10 numeric keys and biometrics', () => {
      const html = fs.readFileSync(path.join(clientDir, 'index.html'), 'utf8');
      expect(html).toContain('id="pin-modal"');
      expect(html).toContain('id="btn-biometric"');
      expect(html).toContain('id="btn-backspace"');
      expect(html).toContain('data-key="1"');
      expect(html).toContain('data-key="0"');
      expect(html).toContain('id="dot-0"');
      expect(html).toContain('id="dot-3"');
    });

    it('index.html must contain the helper QR device pairing modal trigger', () => {
      const html = fs.readFileSync(path.join(clientDir, 'index.html'), 'utf8');
      expect(html).toContain('id="btn-open-pairing"');
      expect(html).toContain('id="pairing-modal"');
    });
  });

  describe('TEST 5: Fastify Static Serving & Live Responses', () => {
    it('GET / should serve index.html with 200 OK and formal title', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/',
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.body).toContain('FROSE Street — Formal Enterprise Street Micro-POS');
      expect(res.body).toContain('1. BILLING COUNTER');
    });

    it('GET /manifest.json should serve valid JSON manifest', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/manifest.json',
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.name).toBe('FROSE Street');
      expect(json.background_color.toUpperCase()).toBe('#FFFFFF');
    });

    it('GET /css/style.css should serve the formal design stylesheet', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/css/style.css',
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('--color-navy: #0F172A');
      expect(res.body).toContain('--color-saffron: #D97706');
    });

    it('GET /js/app.js should serve the PWA controller', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/js/app.js',
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('FROSE Street Client Application');
      expect(res.body).toContain('loadGallaGlance');
    });
  });
});
