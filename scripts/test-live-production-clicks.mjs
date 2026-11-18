import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Projects/FROSE-Restaurant-Platform/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');

async function testLiveProduction() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  console.log('Navigating to live login to set auth...');
  await page.goto('https://street.frosetech.com/login');
  await page.evaluate(() => {
    localStorage.setItem('frose_auth_token', 'cf_token_superadmin_live');
    localStorage.setItem('frose_current_vendor', JSON.stringify({ id: 'v-admin-master', role: 'superadmin', isSuperadmin: true }));
  });

  console.log('Navigating to live https://street.frosetech.com/admin...');
  await page.goto('https://street.frosetech.com/admin');
  await page.waitForTimeout(500);

  // Click Vendors tab
  await page.locator('.nav-tab-pill[data-view="vendors"]').click();
  await page.waitForTimeout(300);
  const isVendors = await page.locator('#view-vendors').isVisible();
  console.log('Live Vendors view visible:', isVendors);

  // Click Users tab
  await page.locator('.nav-tab-pill[data-view="users"]').click();
  await page.waitForTimeout(300);
  const isUsers = await page.locator('#view-users').isVisible();
  console.log('Live Users view visible:', isUsers);

  // Click Settings tab
  await page.locator('.nav-tab-pill[data-view="settings"]').click();
  await page.waitForTimeout(300);
  const isSettings = await page.locator('#view-settings').isVisible();
  console.log('Live Settings view visible:', isSettings);

  // Click Add Stall button
  await page.locator('#btn-bottom-add-restaurant').click();
  await page.waitForTimeout(300);
  const isModalOpen = await page.locator('#modal-add-stall').evaluate(el => el.classList.contains('active'));
  console.log('Live Modal open:', isModalOpen);

  // Close modal
  await page.locator('#btn-close-add-modal').click();
  await page.waitForTimeout(300);
  const isModalClosed = !await page.locator('#modal-add-stall').evaluate(el => el.classList.contains('active'));
  console.log('Live Modal dismissed:', isModalClosed);

  await browser.close();

  if (isVendors && isUsers && isSettings && isModalOpen && isModalClosed) {
    console.log('ALL LIVE PRODUCTION SMOKE TESTS PASSED 100%!');
  } else {
    throw new Error('Live smoke test failed!');
  }
}

testLiveProduction().catch(err => {
  console.error('LIVE TEST ERROR:', err);
  process.exit(1);
});
