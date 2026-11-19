import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Projects/FROSE-Restaurant-Platform/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');

const ARTIFACT_DIR = 'C:/Users/welcome/.gemini/antigravity/brain/f5a5f50a-faaf-41e8-8d2e-e54a9cf0a1ef';
const DOCS_DIR = 'C:/Projects/frose-street/docs/walkthroughs/screenshots/apk-download-qr';
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
fs.mkdirSync(DOCS_DIR, { recursive: true });

const BASE_URL = 'http://127.0.0.1:3100';

async function run() {
  console.log('🚀 Starting Verification: Dual-Mode QR Code Hub & Local Cloud APK / Zip Download...');

  // 1. Verify download endpoints directly
  const apkRes = await fetch(`${BASE_URL}/downloads/frose-street-local-cloud.apk`);
  console.log(`✓ Direct APK fetch status: ${apkRes.status}, Content-Type: ${apkRes.headers.get('content-type')}`);
  if (apkRes.status !== 200) throw new Error('APK download endpoint returned ' + apkRes.status);

  const zipRes = await fetch(`${BASE_URL}/downloads/frose-street-local-cloud.zip`);
  console.log(`✓ Direct ZIP fetch status: ${zipRes.status}, Content-Type: ${zipRes.headers.get('content-type')}`);
  if (zipRes.status !== 200) throw new Error('ZIP download endpoint returned ' + zipRes.status);

  // 2. Obtain Super Admin JWT
  const loginRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '9999999999', password: 'Feroz@123' })
  });
  if (!loginRes.ok) throw new Error('Failed to login as Super Admin');
  const { token } = await loginRes.json();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/login`);
  await page.evaluate((tok) => {
    localStorage.clear();
    localStorage.setItem('frose_auth_token', tok);
    localStorage.setItem('frose_current_vendor', JSON.stringify({
      id: 'v-admin-master',
      phone: '9999999999',
      businessName: 'FROSE Platform HQ',
      ownerName: 'Super Admin',
      role: 'superadmin',
      isSuperadmin: true
    }));
  }, token);

  await page.goto(`${BASE_URL}/admin`);
  await page.waitForTimeout(1000);

  // Navigate to Vendors tab
  await page.click('button.nav-tab-pill:has-text("Vendors"), button[data-view="vendors"]');
  await page.waitForTimeout(600);

  // Open Stall Setup QR modal
  const qrBtn = page.locator('.btn-setup-qr').first();
  await qrBtn.click();
  await page.waitForTimeout(500);

  // Verify Tab 1 (Web App QR)
  const tab1Visible = await page.locator('#modal-stall-setup-qr').isVisible();
  console.log(`✓ Setup QR Modal opened: ${tab1Visible}`);
  if (!tab1Visible) throw new Error('QR Modal failed to open');

  const shot1Artifact = path.join(ARTIFACT_DIR, '01_setup_qr_modal_tab1_webapp.png');
  const shot1Docs = path.join(DOCS_DIR, '01_setup_qr_modal_tab1_webapp.png');
  await page.screenshot({ path: shot1Artifact });
  await page.screenshot({ path: shot1Docs });
  console.log('📸 Captured 01_setup_qr_modal_tab1_webapp.png');

  // Switch to Tab 2 (Download APK / Zip)
  await page.click('#tab-qr-backend');
  await page.waitForTimeout(600);

  const qrSrc = await page.locator('#qr-modal-image').getAttribute('src');
  console.log(`✓ Tab 2 QR Code Source: ${qrSrc}`);
  if (!qrSrc.includes('frose-street-local-cloud.apk')) {
    throw new Error('Tab 2 QR code does not point to APK download!');
  }

  const helperText = await page.locator('#qr-modal-helper-text').textContent();
  console.log(`✓ Tab 2 Helper Text: ${helperText}`);

  const openBtnText = await page.locator('#btn-qr-modal-open-text').textContent();
  console.log(`✓ Tab 2 Action Button: ${openBtnText}`);
  if (!openBtnText.includes('Download Phone Local Cloud APK')) {
    throw new Error('Tab 2 Action Button text is incorrect: ' + openBtnText);
  }

  const shot2Artifact = path.join(ARTIFACT_DIR, '02_setup_qr_modal_tab2_apk_download.png');
  const shot2Docs = path.join(DOCS_DIR, '02_setup_qr_modal_tab2_apk_download.png');
  await page.screenshot({ path: shot2Artifact });
  await page.screenshot({ path: shot2Docs });
  console.log('📸 Captured 02_setup_qr_modal_tab2_apk_download.png');

  await browser.close();
  console.log('🎉 ALL DUAL-MODE QR & LOCAL CLOUD APK DOWNLOAD TESTS PASSED 100%!');
}

run().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
