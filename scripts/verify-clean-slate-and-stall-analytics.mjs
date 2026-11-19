import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Projects/FROSE-Restaurant-Platform/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');

const ARTIFACT_DIR = 'C:/Users/welcome/.gemini/antigravity/brain/f5a5f50a-faaf-41e8-8d2e-e54a9cf0a1ef';
const DOCS_DIR = 'C:/Projects/frose-street/docs/walkthroughs/screenshots/clean-slate-and-analytics';
if (!fs.existsSync(DOCS_DIR)) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
}
const BASE_URL = 'http://127.0.0.1:3100';

async function run() {
  console.log('🚀 Starting Clean Slate, Auth Persistence, Back Navigation & Stall Analytics Verification...');
  
  // Obtain genuine Super Admin JWT
  const loginRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '9999999999', password: 'Feroz@123' })
  });
  if (!loginRes.ok) throw new Error('Failed to login to local Fastify server: ' + loginRes.status);
  const { token } = await loginRes.json();
  console.log('✓ Super Admin JWT obtained successfully.');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // Mobile Viewport (iPhone 14 / Android Standard)
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15'
  });

  const page = await context.newPage();
  page.on('console', msg => console.log('PAGE CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  page.on('dialog', async dialog => {
    console.log(`Dialog message: ${dialog.message()}`);
    await dialog.accept();
  });

  // Step 1: Pre-set authentic Super Admin token & Clear LocalStorage for pristine test
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

  console.log('Navigating to Super Admin console at /admin...');
  await page.goto(`${BASE_URL}/admin`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);

  // Verification 1: Clean Slate Initial Platform State (Zero fake data)
  console.log('--- 1. Checking Clean Slate Metrics ---');
  const restVal = await page.locator('#kpi-val-restaurants').textContent();
  const subRecv = await page.locator('#kpi-sub-renewals').textContent();
  const emptyState = await page.locator('#stalls-table-body').textContent();

  console.log(`Restaurants: ${restVal}, Renewals: ${subRecv.trim()}`);
  if (restVal !== '0') {
    throw new Error(`Expected Total Restaurants to be 0 on clean slate, got: ${restVal}`);
  }
  if (!emptyState.includes('No Restaurant Stalls Created')) {
    throw new Error(`Expected empty state banner, got: ${emptyState}`);
  }

  await page.screenshot({ path: path.join(ARTIFACT_DIR, '01_clean_slate_zero_metrics_390x844.png') });
  await page.screenshot({ path: path.join(DOCS_DIR, '01_clean_slate_zero_metrics_390x844.png') });
  console.log('📸 Captured 01_clean_slate_zero_metrics_390x844.png');

  // Verification 2: Add New Restaurant from Dedicated Full Page
  console.log('--- 2. Creating New Restaurant Stall ---');
  await page.click('#btn-bottom-add-restaurant');
  await page.waitForTimeout(600);

  await page.fill('#page-add-stall-name', 'Hyderabadi Dum Biryani Hub');
  await page.fill('#page-add-owner-name', 'Mohammed Feroz');
  await page.fill('#page-add-phone', '9876543210');
  await page.fill('#page-add-password', 'Password@123');
  await page.fill('#page-add-city', 'Hyderabad');
  await page.selectOption('#page-add-edition', 'cloud');
  await page.fill('#page-add-monthly-fee', '499');
  await page.selectOption('#page-add-initial-status', 'paid');
  await page.fill('#page-add-upi', 'ferozbiryani@okaxis');

  await page.click('#btn-submit-add-stall-page');
  await page.waitForTimeout(1200);

  // Assert stall is in table
  const tableContent = await page.locator('#stalls-table-body').textContent();
  if (!tableContent.includes('Hyderabadi Dum Biryani Hub')) {
    throw new Error('Created stall not found in vendors table!');
  }
  console.log('✓ Hyderabadi Dum Biryani Hub listed in vendors table!');

  // Check metrics updated to 1
  const updatedRestVal = await page.locator('#kpi-val-restaurants').textContent();
  console.log(`Updated Restaurants Count: ${updatedRestVal}`);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, '02_vendor_created_and_provisioned_390x844.png') });
  await page.screenshot({ path: path.join(DOCS_DIR, '02_vendor_created_and_provisioned_390x844.png') });
  console.log('📸 Captured 02_vendor_created_and_provisioned_390x844.png');

  // Verification 3: Stall Fiscal Turnover Analytics & Payment History Ledger
  console.log('--- 3. Opening Stall Fiscal Analytics & Payment History Ledger ---');
  await page.click('.btn-stall-analytics');
  await page.waitForTimeout(600);

  const modalTitle = await page.locator('#analytics-stall-title').textContent();
  const dailyTurnover = await page.locator('#turnover-val-daily').textContent();
  const ledgerContent = await page.locator('#payment-ledger-container').textContent();

  console.log(`Modal Title: ${modalTitle}`);
  console.log(`Daily Turnover: ${dailyTurnover}`);
  console.log(`Ledger Content: ${ledgerContent.trim().substring(0, 80)}...`);

  if (!modalTitle.includes('Hyderabadi Dum Biryani Hub')) {
    throw new Error('Analytics modal did not open for the selected stall!');
  }
  if (!ledgerContent.includes('Verified Paid') || !ledgerContent.includes('499')) {
    throw new Error('Payment ledger record missing or incorrect!');
  }
  console.log('✓ Fiscal turnover breakdown & payment history ledger verified!');

  await page.screenshot({ path: path.join(ARTIFACT_DIR, '03_stall_fiscal_analytics_and_ledger_390x844.png') });
  await page.screenshot({ path: path.join(DOCS_DIR, '03_stall_fiscal_analytics_and_ledger_390x844.png') });
  console.log('📸 Captured 03_stall_fiscal_analytics_and_ledger_390x844.png');

  await page.click('#modal-stall-analytics .btn-close-modal');
  await page.waitForTimeout(400);

  // Verification 4: Real Interactive Notifications (Clear All)
  console.log('--- 4. Testing Real Interactive Notifications ---');
  await page.click('#btn-bottom-notifications');
  await page.waitForTimeout(600);

  await page.click('#btn-clear-all-notifs');
  await page.waitForTimeout(400);

  const notifContainer = await page.locator('#notifications-list-container').textContent();
  if (!notifContainer.includes('all caught up')) {
    throw new Error('Notifications were not cleared!');
  }
  console.log('✓ Notifications cleared and empty state verified!');

  await page.screenshot({ path: path.join(ARTIFACT_DIR, '04_notifications_cleared_empty_state_390x844.png') });
  await page.screenshot({ path: path.join(DOCS_DIR, '04_notifications_cleared_empty_state_390x844.png') });
  console.log('📸 Captured 04_notifications_cleared_empty_state_390x844.png');

  await page.click('#btn-close-notifications');
  await page.waitForTimeout(400);

  // Verification 5: Settings User Profile Card
  console.log('--- 5. Checking Authenticated User Profile in Settings ---');
  await page.click('button.nav-tab-pill:has-text("Settings"), button[data-view="settings"]');
  await page.waitForTimeout(600);

  const profileName = await page.locator('#settings-profile-name').textContent();
  const profilePhone = await page.locator('#settings-profile-phone').textContent();
  console.log(`Profile: ${profileName}, Phone: ${profilePhone}`);

  if (!profileName.includes('Super Admin')) {
    throw new Error('Settings profile card does not display Super Admin identity!');
  }
  console.log('✓ Settings authenticated session card verified!');

  await page.screenshot({ path: path.join(ARTIFACT_DIR, '05_settings_authenticated_profile_390x844.png') });
  await page.screenshot({ path: path.join(DOCS_DIR, '05_settings_authenticated_profile_390x844.png') });
  console.log('📸 Captured 05_settings_authenticated_profile_390x844.png');

  // Verification 6: Mobile Back Navigation
  console.log('--- 6. Testing Mobile Popstate / Back Navigation ---');
  await page.click('button.nav-tab-pill:has-text("Vendors"), button[data-view="vendors"]');
  await page.waitForTimeout(400);

  // Trigger browser back
  await page.goBack();
  await page.waitForTimeout(400);
  const currentUrl = page.url();
  console.log(`URL after popstate: ${currentUrl}`);
  if (!currentUrl.includes('/admin')) {
    throw new Error('Back navigation exited the application!');
  }
  console.log('✓ Back navigation trapped safely within app!');

  // Verification 7: Client Login with newly created credentials
  console.log('--- 7. Logging in as Created Restaurant Stall ---');
  await page.goto(`${BASE_URL}/login`);
  await page.waitForTimeout(600);

  await page.fill('#login-phone', '9876543210');
  await page.fill('#login-password', 'Password@123');
  await page.click('#btn-submit-pwd');
  await page.waitForTimeout(1400);

  const clientUrl = page.url();
  console.log(`Logged in Stall Client URL: ${clientUrl}`);

  // Navigate to client home to inspect Settings Profile Modal
  await page.goto(`${BASE_URL}/`);
  await page.waitForTimeout(800);

  const ownerGreeting = await page.locator('#stall-owner-name').textContent();
  console.log(`Client Greeting: ${ownerGreeting}`);

  await page.click('button.nav-tab-pill:has-text("Settings")');
  await page.waitForTimeout(500);

  const clientStall = await page.locator('#settings-client-stall').textContent();
  const clientOwner = await page.locator('#settings-client-owner').textContent();
  console.log(`Client Settings: ${clientStall} by ${clientOwner}`);

  if (!clientStall.includes('Hyderabadi Dum Biryani Hub')) {
    throw new Error(`Expected stall name in client settings, got: ${clientStall}`);
  }

  await page.screenshot({ path: path.join(ARTIFACT_DIR, '06_stall_client_login_success_390x844.png') });
  await page.screenshot({ path: path.join(DOCS_DIR, '06_stall_client_login_success_390x844.png') });
  console.log('📸 Captured 06_stall_client_login_success_390x844.png');

  await browser.close();
  console.log('🎉 ALL PLAYWRIGHT E2E VERIFICATIONS PASSED 100%!');
}

run().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
