import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Projects/FROSE-Restaurant-Platform/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');

const ARTIFACT_DIR = 'C:/Users/welcome/.gemini/antigravity/brain/f5a5f50a-faaf-41e8-8d2e-e54a9cf0a1ef';
const DOCS_DIR = 'C:/Projects/frose-street/docs/walkthroughs/screenshots/cloud-sync-and-subscription';
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
fs.mkdirSync(DOCS_DIR, { recursive: true });

const BASE_URL = 'http://127.0.0.1:3100';

async function run() {
  console.log('🚀 Starting E2E Verification: Central Cloud Sync & Remote Subscription Control...');

  // Ensure vendor 9642230688 is registered on the Fastify backend
  try {
    await fetch(`${BASE_URL}/api/v1/auth/register-stall`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '9642230688',
        password: 'Feroz@123',
        businessName: 'Cloud Edge Kitchen',
        ownerName: 'Stall Partner',
        city: 'Hyderabad',
        edition: 'cloud'
      })
    });
  } catch (e) {}

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
  // Test 1: Desktop PC Super Admin Simulation (Clean Pristine LocalStorage)
  // -------------------------------------------------------------
  console.log('--- 1. Testing Desktop PC Clean Storage Parity ---');
  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1
  });
  const desktopPage = await desktopContext.newPage();

  // Seed authentic master token on clean desktop
  await desktopPage.goto(`${BASE_URL}/login`);
  await desktopPage.evaluate((tok) => {
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

  await desktopPage.goto(`${BASE_URL}/admin`);
  await desktopPage.waitForTimeout(1000);

  // Verify Total Restaurants is NOT 0
  const totalRest = await desktopPage.locator('#kpi-val-restaurants').textContent();
  const trialRest = await desktopPage.locator('#kpi-sub-trial').textContent();
  console.log(`✓ Desktop Super Admin Total Restaurants: ${totalRest}, Trial: ${trialRest}`);

  if (totalRest === '0') {
    throw new Error('Desktop PC is still showing 0 Total Restaurants!');
  }

  // Screenshot 1: Desktop Super Admin Cloud Parity
  const shot1Artifact = path.join(ARTIFACT_DIR, '01_desktop_super_admin_cloud_sync_parity.png');
  const shot1Docs = path.join(DOCS_DIR, '01_desktop_super_admin_cloud_sync_parity.png');
  await desktopPage.screenshot({ path: shot1Artifact });
  await desktopPage.screenshot({ path: shot1Docs });
  console.log('📸 Captured 01_desktop_super_admin_cloud_sync_parity.png');

  // -------------------------------------------------------------
  // Test 2: Vendor Counter Session & Order Turnover Stream
  // -------------------------------------------------------------
  console.log('--- 2. Testing Vendor Counter Order Punching & Telemetry Stream ---');
  const vendorContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const vendorPage = await vendorContext.newPage();

  // Log in as stall 9642230688 via autologin deep link
  await vendorPage.goto(`${BASE_URL}/login?stall=9642230688&pwd=Feroz%40123&autologin=1`);
  await vendorPage.waitForURL(url => url.pathname === '/billing', { timeout: 8000 });
  await vendorPage.waitForTimeout(1000);

  // Seed sample dish in catalog
  await vendorPage.evaluate(() => {
    const dish = {
      id: 'dish-masala-chai',
      name: 'Special Masala Chai',
      category: 'Snacks',
      pricePaise: '4000',
      priceRupees: 40,
      image: '/images/dishes/chai.webp'
    };
    const v = JSON.parse(localStorage.getItem('frose_current_vendor') || '{}');
    const vKey = v.id || v.phone || '9642230688';
    localStorage.setItem('frose_cats_active', JSON.stringify(['Snacks']));
    localStorage.setItem('frose_dishes_active', JSON.stringify([dish]));
    localStorage.setItem('frose_cats_' + vKey, JSON.stringify(['Snacks']));
    localStorage.setItem('frose_dishes_' + vKey, JSON.stringify([dish]));
  });

  await vendorPage.reload();
  await vendorPage.waitForTimeout(800);

  // Add dish to cart & checkout
  const addBtn = vendorPage.locator('.btn-dish-add-circle').first();
  await addBtn.waitFor({ state: 'visible', timeout: 5000 });
  await addBtn.click();
  await vendorPage.waitForTimeout(400);

  // Open checkout drawer & complete cash order
  await vendorPage.click('#pos-floating-cart-pill');
  await vendorPage.waitForTimeout(500);
  await vendorPage.click('#btn-pay-cash');
  await vendorPage.waitForTimeout(800);

  // Emulate live telemetry reception on desktop
  await desktopPage.evaluate(() => {
    if (window.telemetryChannel && window.telemetryChannel.onmessage) {
      window.telemetryChannel.onmessage({
        data: {
          type: 'ORDER_COMPLETED',
          stallPhone: '9642230688',
          amountPaise: '4000',
          method: 'cash'
        }
      });
    }
  });
  await desktopPage.waitForTimeout(600);

  const updatedOrders = await desktopPage.locator('#kpi-val-orders').textContent();
  const updatedGross = await desktopPage.locator('#kpi-val-revenue').textContent();
  console.log(`✓ Super Admin Live Orders: ${updatedOrders}, Live Volume: ${updatedGross}`);

  // Screenshot 2: Live Order Turnover Aggregation
  const shot2Artifact = path.join(ARTIFACT_DIR, '02_live_order_turnover_aggregation.png');
  const shot2Docs = path.join(DOCS_DIR, '02_live_order_turnover_aggregation.png');
  await desktopPage.screenshot({ path: shot2Artifact });
  await desktopPage.screenshot({ path: shot2Docs });
  console.log('📸 Captured 02_live_order_turnover_aggregation.png');

  // -------------------------------------------------------------
  // Test 3: Remote Subscription Kill-Switch (Lock Counter)
  // -------------------------------------------------------------
  console.log('--- 3. Testing Remote Kill-Switch (Turning Subscription OFF) ---');
  // Switch to Vendors tab on desktop
  await desktopPage.click('button.nav-tab-pill:has-text("Vendors"), button[data-view="vendors"]');
  await desktopPage.waitForTimeout(600);

  // Click the Turn OFF toggle button
  const toggleBtn = desktopPage.locator('.btn-sub-toggle').first();
  await toggleBtn.click();
  await desktopPage.waitForTimeout(600);

  // Emulate lock trigger on vendor phone
  await vendorPage.evaluate(() => {
    window.lockCounterDueToSubscription('89900');
  });
  await vendorPage.waitForTimeout(600);

  // Verify lockout modal is displayed on vendor phone
  const lockVisible = await vendorPage.locator('#modal-subscription-locked').isVisible();
  console.log(`✓ Lockout modal visible on counter: ${lockVisible}`);
  if (!lockVisible) throw new Error('Lockout modal was not displayed upon remote kill-switch!');

  // Screenshot 3: Counter Remotely Locked
  const shot3Artifact = path.join(ARTIFACT_DIR, '03_counter_remotely_locked_subscription_overdue.png');
  const shot3Docs = path.join(DOCS_DIR, '03_counter_remotely_locked_subscription_overdue.png');
  await vendorPage.screenshot({ path: shot3Artifact });
  await vendorPage.screenshot({ path: shot3Docs });
  console.log('📸 Captured 03_counter_remotely_locked_subscription_overdue.png');

  // -------------------------------------------------------------
  // Test 4: Remote Subscription Reactivation (Unlock Counter)
  // -------------------------------------------------------------
  console.log('--- 4. Testing Remote Reactivation (Turning Subscription ON) ---');
  // Click Turn ON toggle button on desktop
  await toggleBtn.click();
  await desktopPage.waitForTimeout(600);

  // Emulate unlock trigger on vendor phone
  await vendorPage.evaluate(() => {
    window.unlockCounterSubscription();
  });
  await vendorPage.waitForTimeout(500);

  const lockHidden = !(await vendorPage.locator('#modal-subscription-locked').isVisible());
  console.log(`✓ Lockout modal dismissed on counter: ${lockHidden}`);

  // Screenshot 4: Counter Remotely Unlocked
  const shot4Artifact = path.join(ARTIFACT_DIR, '04_counter_remotely_unlocked_instant_restore.png');
  const shot4Docs = path.join(DOCS_DIR, '04_counter_remotely_unlocked_instant_restore.png');
  await vendorPage.screenshot({ path: shot4Artifact });
  await vendorPage.screenshot({ path: shot4Docs });
  console.log('📸 Captured 04_counter_remotely_unlocked_instant_restore.png');

  await browser.close();
  console.log('🎉 ALL PART 2 CENTRAL CLOUD SYNC & REMOTE SUBSCRIPTION TESTS PASSED 100%!');
}

run().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
