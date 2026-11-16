import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Phase 2 Acceptance: Domain & Infrastructure Configuration', () => {
  const rootDir = path.resolve(__dirname, '../../');

  describe('TEST 1: Cloudflare Pages Configuration', () => {
    it('should have a valid wrangler.toml pointing to ./client', () => {
      const wranglerPath = path.join(rootDir, 'wrangler.toml');
      expect(fs.existsSync(wranglerPath)).toBe(true);

      const content = fs.readFileSync(wranglerPath, 'utf8');
      expect(content).toContain('name = "frose-street"');
      expect(content).toContain('pages_build_output_dir = "./client"');
      expect(content).toContain('street.frostech.com');
      expect(content).toContain('https://api.street.frostech.com/v1');
    });

    it('should have _headers with strict Service Worker no-cache rules', () => {
      const headersPath = path.join(rootDir, 'client/_headers');
      expect(fs.existsSync(headersPath)).toBe(true);

      const content = fs.readFileSync(headersPath, 'utf8');
      expect(content).toContain('X-Frame-Options: DENY');
      expect(content).toContain('X-Content-Type-Options: nosniff');
      expect(content).toContain('Strict-Transport-Security');
      expect(content).toContain('/sw.js');
      expect(content).toContain('max-age=0, no-cache, no-store, must-revalidate');
    });

    it('should have _routes.json excluding /api/* from static routing', () => {
      const routesPath = path.join(rootDir, 'client/_routes.json');
      expect(fs.existsSync(routesPath)).toBe(true);

      const routes = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
      expect(routes.version).toBe(1);
      expect(routes.include).toContain('/*');
      expect(routes.exclude).toContain('/api/*');
    });
  });

  describe('TEST 2: Static Client PWA Pre-Deployment Integrity', () => {
    it('should have all static client entry files', () => {
      const clientDir = path.join(rootDir, 'client');
      expect(fs.existsSync(path.join(clientDir, 'index.html'))).toBe(true);
      expect(fs.existsSync(path.join(clientDir, 'css/style.css'))).toBe(true);
      expect(fs.existsSync(path.join(clientDir, 'js/app.js'))).toBe(true);
      expect(fs.existsSync(path.join(clientDir, 'manifest.json'))).toBe(true);
      expect(fs.existsSync(path.join(clientDir, 'sw.js'))).toBe(true);
    });

    it('should have mobile meta tags and manifest link in index.html', () => {
      const htmlPath = path.join(rootDir, 'client/index.html');
      const html = fs.readFileSync(htmlPath, 'utf8');
      expect(html).toContain('viewport');
      expect(html).toContain('width=device-width');
      expect(html).toContain('<link rel="manifest" href="/manifest.json">');
      expect(html).toContain('street.frostech.com');
    });
  });

  describe('TEST 3: Reverse Proxy & CORS Templates (api.street.frostech.com)', () => {
    it('Caddyfile should configure SSL, CORS, and WebSocket reverse proxy', () => {
      const caddyPath = path.join(rootDir, 'deploy/caddy/Caddyfile');
      expect(fs.existsSync(caddyPath)).toBe(true);

      const caddy = fs.readFileSync(caddyPath, 'utf8');
      expect(caddy).toContain('api.street.frostech.com');
      expect(caddy).toContain('reverse_proxy localhost:3100');
      expect(caddy).toContain('Access-Control-Allow-Origin "https://street.frostech.com"');
      expect(caddy).toContain('Access-Control-Allow-Credentials "true"');
    });

    it('Nginx config should configure SSL, CORS, and WebSocket upgrade headers', () => {
      const nginxPath = path.join(rootDir, 'deploy/nginx/street.frostech.com.conf');
      expect(fs.existsSync(nginxPath)).toBe(true);

      const nginx = fs.readFileSync(nginxPath, 'utf8');
      expect(nginx).toContain('server_name api.street.frostech.com;');
      expect(nginx).toContain('proxy_set_header Upgrade $http_upgrade;');
      expect(nginx).toContain('proxy_set_header Connection "upgrade";');
      expect(nginx).toContain('https://street.frostech.com');
    });
  });

  describe('TEST 4: Production Container & VPS Deployment', () => {
    it('Dockerfile should configure multi-stage build and healthcheck', () => {
      const dockerfilePath = path.join(rootDir, 'Dockerfile');
      expect(fs.existsSync(dockerfilePath)).toBe(true);

      const dockerfile = fs.readFileSync(dockerfilePath, 'utf8');
      expect(dockerfile).toContain('FROM node:20-alpine AS builder');
      expect(dockerfile).toContain('FROM node:20-alpine AS runner');
      expect(dockerfile).toContain('EXPOSE 3100');
      expect(dockerfile).toContain('HEALTHCHECK');
      expect(dockerfile).toContain('/health');
    });

    it('docker-compose.yml should configure API, PostgreSQL 16, and Redis 7', () => {
      const composePath = path.join(rootDir, 'docker-compose.yml');
      expect(fs.existsSync(composePath)).toBe(true);

      const compose = fs.readFileSync(composePath, 'utf8');
      expect(compose).toContain('image: postgres:16-alpine');
      expect(compose).toContain('image: redis:7-alpine');
      expect(compose).toContain('frose-street-api');
      expect(compose).toContain('3100:3100');
      expect(compose).toContain('CORS_ORIGIN=https://street.frostech.com');
    });
  });
});
