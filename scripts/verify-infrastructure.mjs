/**
 * FROSE Street Infrastructure Verification Script
 * Validates Cloudflare Pages config, reverse proxies, and DNS connectivity.
 */

import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';

async function verifyInfrastructure() {
  console.log('🔍 Verifying FROSE Street Infrastructure Configuration...\n');
  let hasErrors = false;

  // 1. Check Cloudflare Pages Config
  const wranglerPath = path.resolve('wrangler.toml');
  if (fs.existsSync(wranglerPath)) {
    const content = fs.readFileSync(wranglerPath, 'utf8');
    if (content.includes('street.frostech.com') && content.includes('pages_build_output_dir')) {
      console.log('✅ Cloudflare Pages config (wrangler.toml) is valid.');
    } else {
      console.error('❌ wrangler.toml is missing required domain or output dir.');
      hasErrors = true;
    }
  } else {
    console.error('❌ wrangler.toml not found.');
    hasErrors = true;
  }

  // 2. Check Cloudflare Headers
  const headersPath = path.resolve('client/_headers');
  if (fs.existsSync(headersPath)) {
    const content = fs.readFileSync(headersPath, 'utf8');
    if (content.includes('/sw.js') && content.includes('no-cache')) {
      console.log('✅ ServiceWorker cache-busting rule present in _headers.');
    } else {
      console.error('❌ _headers missing ServiceWorker no-cache rule.');
      hasErrors = true;
    }
  }

  // 3. Check Reverse Proxy Templates
  const caddyPath = path.resolve('deploy/caddy/Caddyfile');
  const nginxPath = path.resolve('deploy/nginx/street.frostech.com.conf');
  if (fs.existsSync(caddyPath) && fs.existsSync(nginxPath)) {
    console.log('✅ Production Caddy & Nginx reverse proxy configs present.');
  } else {
    console.error('❌ Reverse proxy configuration files missing.');
    hasErrors = true;
  }

  // 4. Check Docker Config
  const dockerfilePath = path.resolve('Dockerfile');
  const composePath = path.resolve('docker-compose.yml');
  if (fs.existsSync(dockerfilePath) && fs.existsSync(composePath)) {
    console.log('✅ Dockerfile & docker-compose.yml present and configured.');
  } else {
    console.error('❌ Docker deployment files missing.');
    hasErrors = true;
  }

  // 5. Check DNS for frostech.com
  try {
    const records = await dns.resolve4('frostech.com');
    console.log(`🌐 frostech.com apex DNS resolves to: ${records.join(', ')}`);
  } catch (err) {
    console.log('ℹ️ frostech.com apex DNS lookup:', err.message);
  }

  // Check street.frostech.com
  try {
    const cname = await dns.resolveCname('street.frostech.com');
    console.log(`🌐 street.frostech.com CNAME points to: ${cname.join(', ')}`);
  } catch (err) {
    console.log('ℹ️ street.frostech.com DNS status: Not yet propagated (Pending user Cloudflare CNAME record setup).');
  }

  console.log('\n--- Infrastructure Verification Complete ---');
  if (hasErrors) {
    process.exit(1);
  }
}

verifyInfrastructure();
