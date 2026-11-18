import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Projects/FROSE-Restaurant-Platform/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');

const screenshotDir = path.resolve('docs/walkthroughs/screenshots/super-admin-hotfix');
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

async function runVerification() {
  // 1. Get Genuine Super Admin JWT
  const loginRes = await fetch('http://127.0.0.1:3100/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '9999999999', password: 'Feroz@123' })
  });
  if (!loginRes.ok) throw new Error('Failed to obtain superadmin token from backend: ' + loginRes.status);
  const loginData = await loginRes.json();
  const validToken = loginData.token;
  console.log('Genuine Super Admin token acquired.');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1'
  });

  const page = await context.newPage();

  // Set token directly in origin localStorage
  console.log('Navigating to login to set localStorage token...');
  await page.goto('http://127.0.0.1:3100/login');
  await page.evaluate((tok) => {
    localStorage.setItem('frose_auth_token', tok);
    localStorage.setItem('frose_current_vendor', JSON.stringify({
      id: 'v-admin-master',
      phone: '9999999999',
      businessName: 'FROSE Platform HQ',
      role: 'superadmin',
      isSuperadmin: true
    }));
  }, validToken);

  console.log('Navigating to http://127.0.0.1:3100/admin at 390x844...');
  await page.goto('http://127.0.0.1:3100/admin');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(600);

  console.log('Current URL in Admin:', page.url());

  // 1. Check Trademark & Title
  const tmBox = await page.locator('.brand-trademark').boundingBox();
  const froseBox = await page.locator('.brand-word-frose').boundingBox();
  const streetBox = await page.locator('.brand-word-street').boundingBox();

  console.log('FROSE Box:', froseBox);
  console.log('STREET Box:', streetBox);
  console.log('TM Box:', tmBox);

  if (!tmBox || !froseBox || !streetBox) {
    throw new Error('Header brand elements not found!');
  }

  // Verify TM is to the right of FROSE and not overlapping
  if (tmBox.x < froseBox.x + froseBox.width) {
    throw new Error(`OVERLAP DETECTED: TM (x: ${tmBox.x}) overlaps with FROSE (right: ${froseBox.x + froseBox.width})`);
  }
  console.log('PASS: TM does NOT overlap with FROSE!');

  // 2. Check Top Navigation Tabs Bounding Boxes
  const tabs = await page.locator('.nav-tab-pill').all();
  if (tabs.length !== 4) {
    throw new Error(`Expected 4 top tabs, found ${tabs.length}`);
  }

  const tabBoxes = [];
  for (let i = 0; i < tabs.length; i++) {
    const box = await tabs[i].boundingBox();
    const text = (await tabs[i].innerText()).trim();
    tabBoxes.push({ index: i, text, box });
    console.log(`Tab ${i + 1} (${text}): x=${box.x}, width=${box.width}, right=${box.x + box.width}`);
  }

  // Verify NO overlapping between adjacent tabs
  for (let i = 0; i < tabBoxes.length - 1; i++) {
    const current = tabBoxes[i];
    const next = tabBoxes[i + 1];
    if (current.box.x + current.box.width > next.box.x + 0.5) { // allow 0.5px subpixel tolerance
      throw new Error(`OVERLAP DETECTED between Tab ${current.text} and Tab ${next.text}! Right=${current.box.x + current.box.width}, Next X=${next.box.x}`);
    }
  }
  console.log('PASS: All 4 top tabs are strictly separated with zero overlap!');

  // 3. Test Clicking Top Tabs
  console.log('Testing Tab Clicks...');
  // Click Vendors
  await page.locator('.nav-tab-pill[data-view="vendors"]').click();
  await page.waitForTimeout(300);
  let isVendorsVisible = await page.locator('#view-vendors').isVisible();
  if (!isVendorsVisible) throw new Error('Clicking Vendors tab failed to show #view-vendors!');
  console.log('PASS: Vendors tab click activated #view-vendors');

  // Click Users
  await page.locator('.nav-tab-pill[data-view="users"]').click();
  await page.waitForTimeout(300);
  let isUsersVisible = await page.locator('#view-users').isVisible();
  if (!isUsersVisible) throw new Error('Clicking Users tab failed to show #view-users!');
  console.log('PASS: Users tab click activated #view-users');

  // Click Settings
  await page.locator('.nav-tab-pill[data-view="settings"]').click();
  await page.waitForTimeout(300);
  let isSettingsVisible = await page.locator('#view-settings').isVisible();
  if (!isSettingsVisible) throw new Error('Clicking Settings tab failed to show #view-settings!');
  console.log('PASS: Settings tab click activated #view-settings');

  // Click Dashboard
  await page.locator('.nav-tab-pill[data-view="dashboard"]').click();
  await page.waitForTimeout(300);
  let isDashboardVisible = await page.locator('#view-dashboard').isVisible();
  if (!isDashboardVisible) throw new Error('Clicking Dashboard tab failed to show #view-dashboard!');
  console.log('PASS: Dashboard tab click activated #view-dashboard');

  // 4. Test Bottom Navigation Dock Clicks
  console.log('Testing Bottom Dock Clicks...');
  // Click Analytics
  await page.locator('#btn-bottom-analytics').click();
  await page.waitForTimeout(300);
  let isAnalyticsVisible = await page.locator('#view-analytics').isVisible();
  if (!isAnalyticsVisible) throw new Error('Bottom Analytics button failed to show #view-analytics!');
  console.log('PASS: Bottom Analytics button activated #view-analytics');

  // Click Add Stall (+)
  await page.locator('#btn-bottom-add-restaurant').click();
  await page.waitForTimeout(300);
  let isModalAddOpen = await page.locator('#modal-add-stall').evaluate(el => el.classList.contains('active'));
  if (!isModalAddOpen) throw new Error('Bottom Add Stall button failed to open #modal-add-stall!');
  console.log('PASS: Bottom Add Stall button opened #modal-add-stall');

  // Close Add Stall Modal
  await page.locator('#btn-close-add-modal').click();
  await page.waitForTimeout(300);
  isModalAddOpen = await page.locator('#modal-add-stall').evaluate(el => el.classList.contains('active'));
  if (isModalAddOpen) throw new Error('Close modal button failed to dismiss #modal-add-stall!');
  console.log('PASS: Close button dismissed #modal-add-stall');

  // Back to Dashboard
  await page.locator('#btn-bottom-home').click();
  await page.waitForTimeout(300);

  // Take Screenshots for documentation
  await page.screenshot({ path: path.join(screenshotDir, '01_mobile_dashboard_verified_390x844.png') });
  console.log('Captured: 01_mobile_dashboard_verified_390x844.png');

  await page.locator('.nav-tab-pill[data-view="vendors"]').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(screenshotDir, '02_mobile_vendors_verified_390x844.png') });
  console.log('Captured: 02_mobile_vendors_verified_390x844.png');

  await browser.close();
  console.log('ALL PLAYWRIGHT TESTS PASSED WITH ZERO ERRORS AND ZERO OVERLAPS!');
}

runVerification().catch(err => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
