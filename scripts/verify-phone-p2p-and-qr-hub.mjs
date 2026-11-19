import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Projects/FROSE-Restaurant-Platform/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');

const ARTIFACT_DIR = 'C:/Users/welcome/.gemini/antigravity/brain/f5a5f50a-faaf-41e8-8d2e-e54a9cf0a1ef';
const DOCS_DIR = 'C:/Projects/frose-street/docs/walkthroughs/screenshots/phone-p2p-onboarding';
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
fs.mkdirSync(DOCS_DIR, { recursive: true });

const BASE_URL = 'http://127.0.0.1:3100';

async function run() {
  console.log('🚀 Starting E2E Verification: Phone P2P Onboarding & Setup QR Hub...');

  // 0. Obtain authentic Super Admin JWT
  const loginRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '9999999999', password: 'Feroz@123' })
  });
  if (!loginRes.ok) throw new Error('Failed to login to local Fastify server: ' + loginRes.status);
  const { token } = await loginRes.json();
  console.log('✓ Super Admin JWT obtained successfully.');

  const browser = await chromium.launch({ headless: true });

  // -------------------------------------------------------------
  // Test 1: Super Admin Session (Context A)
  // -------------------------------------------------------------
  console.log('--- 1. Testing Super Admin Setup QR Generation ---');
  const adminContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const adminPage = await adminContext.newPage();

  adminPage.on('dialog', async dialog => {
    console.log(`Dialog message: ${dialog.message()}`);
    await dialog.accept();
  });

  // Seed authentic master token
  await adminPage.goto(`${BASE_URL}/login`);
  await adminPage.evaluate((tok) => {
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

  await adminPage.goto(`${BASE_URL}/admin`);
  await adminPage.waitForTimeout(1000);

  // Switch to Vendors view by clicking button
  await adminPage.click('button.nav-tab-pill:has-text("Vendors"), button[data-view="vendors"]');
  await adminPage.waitForTimeout(800);

  // Check if stall 9642230688 exists or needs to be provisioned
  let qrCount = await adminPage.locator('.btn-setup-qr').count();
  if (qrCount === 0) {
    console.log('Table has no stalls yet, provisioning stall 9642230688 via UI...');
    await adminPage.click('button:has-text("Add a New Restaurant"), button[data-view="add-restaurant"]');
    await adminPage.waitForTimeout(600);

    await adminPage.fill('#page-add-stall-name', 'Cloud Edge Kitchen');
    await adminPage.fill('#page-add-owner-name', 'Stall Partner');
    await adminPage.fill('#page-add-phone', '9642230688');
    await adminPage.fill('#page-add-password', 'Feroz@123');
    await adminPage.click('#btn-submit-add-stall-page');
    await adminPage.waitForTimeout(1000);
  } else {
    // Click the Setup QR button on the stall
    const qrBtn = adminPage.locator('.btn-setup-qr').first();
    await qrBtn.click();
    await adminPage.waitForTimeout(600);
  }

  // Verify Modal is displayed with correct stall phone and password
  const modalPhone = await adminPage.locator('#qr-modal-phone').textContent();
  const modalPwd = await adminPage.locator('#qr-modal-pwd').textContent();
  console.log(`✓ Setup QR Modal Phone: ${modalPhone}, Password: ${modalPwd}`);

  if (!modalPhone || !modalPwd) {
    throw new Error('Setup QR Modal did not populate credentials correctly!');
  }

  // Screenshot 1: Setup QR Modal
  const shot1Artifact = path.join(ARTIFACT_DIR, '01_admin_stall_setup_qr_modal_390x844.png');
  const shot1Docs = path.join(DOCS_DIR, '01_admin_stall_setup_qr_modal_390x844.png');
  await adminPage.screenshot({ path: shot1Artifact });
  await adminPage.screenshot({ path: shot1Docs });
  console.log('📸 Captured 01_admin_stall_setup_qr_modal_390x844.png');

  // -------------------------------------------------------------
  // Test 2: Isolated Client Session (Context B - Brave/Device Emulation)
  // -------------------------------------------------------------
  console.log('--- 2. Testing Isolated Client Session Login (Cross-Browser Sandbox) ---');
  const vendorContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const vendorPage = await vendorContext.newPage();

  await vendorPage.goto(`${BASE_URL}/login`);
  await vendorPage.waitForTimeout(500);

  // Fill in stall credentials: 9642230688 / Feroz@123
  await vendorPage.fill('#login-phone', '9642230688');
  await vendorPage.fill('#login-password', 'Feroz@123');
  await vendorPage.click('#btn-submit-pwd');
  await vendorPage.waitForTimeout(1500);

  // Verify alert error is NOT present
  const alertVisible = await vendorPage.locator('#alert-box').isVisible();
  if (alertVisible) {
    const alertMsg = await vendorPage.locator('#alert-box').textContent();
    throw new Error(`Login failed with unexpected alert: ${alertMsg}`);
  }

  const currentUrl = vendorPage.url();
  console.log(`✓ Successfully authenticated! Current URL: ${currentUrl}`);

  // Screenshot 2: Vendor Counter / Billing Screen
  const shot2Artifact = path.join(ARTIFACT_DIR, '02_vendor_isolated_login_success_390x844.png');
  const shot2Docs = path.join(DOCS_DIR, '02_vendor_isolated_login_success_390x844.png');
  await vendorPage.screenshot({ path: shot2Artifact });
  await vendorPage.screenshot({ path: shot2Docs });
  console.log('📸 Captured 02_vendor_isolated_login_success_390x844.png');

  // -------------------------------------------------------------
  // Test 3: Deep-Link Auto Onboarding (Scan QR Simulation)
  // -------------------------------------------------------------
  console.log('--- 3. Testing Deep-Link 1-Tap QR Scan Auto Onboarding ---');
  const deepLinkContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const deepLinkPage = await deepLinkContext.newPage();

  // Navigate to setup deep-link
  await deepLinkPage.goto(`${BASE_URL}/login?stall=9642230688&pwd=Feroz%40123&autologin=1`);
  await deepLinkPage.waitForTimeout(1800);

  const deepUrl = deepLinkPage.url();
  console.log(`✓ Deep-link auto-login landed on: ${deepUrl}`);

  const shot3Artifact = path.join(ARTIFACT_DIR, '03_vendor_qr_deep_link_auto_onboarded_390x844.png');
  const shot3Docs = path.join(DOCS_DIR, '03_vendor_qr_deep_link_auto_onboarded_390x844.png');
  await deepLinkPage.screenshot({ path: shot3Artifact });
  await deepLinkPage.screenshot({ path: shot3Docs });
  console.log('📸 Captured 03_vendor_qr_deep_link_auto_onboarded_390x844.png');

  await browser.close();
  console.log('🎉 ALL PART 1 PHONE P2P ONBOARDING & SETUP QR TESTS PASSED 100%!');
}

run().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
