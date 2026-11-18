import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Projects/FROSE-Restaurant-Platform/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');

const screenshotDir = path.resolve('docs/walkthroughs/screenshots/super-admin-add-page');
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

async function verifyFeatures() {
  const loginRes = await fetch('http://127.0.0.1:3100/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '9999999999', password: 'Feroz@123' })
  });
  if (!loginRes.ok) throw new Error('Failed to login to local Fastify server: ' + loginRes.status);
  const { token } = await loginRes.json();
  console.log('Super Admin JWT obtained.');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15'
  });
  const page = await context.newPage();

  // Handle dialog alerts automatically
  page.on('dialog', async dialog => {
    console.log('Dialog opened:', dialog.message());
    await dialog.accept();
  });
  page.on('console', msg => console.log('PAGE CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  console.log('Setting localStorage token at /login...');
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
  }, token);

  console.log('Navigating to http://127.0.0.1:3100/admin...');
  await page.goto('http://127.0.0.1:3100/admin');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(600);

  // 1. Switch to Vendors View
  console.log('Testing Vendors tab click...');
  await page.locator('.nav-tab-pill[data-view="vendors"]').click();
  await page.waitForTimeout(300);
  let isVendors = await page.locator('#view-vendors').isVisible();
  if (!isVendors) throw new Error('Vendors tab did not activate #view-vendors');
  console.log('PASS: Vendors tab is active.');

  // 2. Test Filter Pills Clicking
  console.log('Testing Filter Pills...');
  // Tap Active (4)
  await page.locator('.filter-pill[data-filter="active"]').click();
  await page.waitForTimeout(300);
  let activeHasClass = await page.locator('.filter-pill[data-filter="active"]').evaluate(el => el.classList.contains('active'));
  let allHasClass = await page.locator('.filter-pill[data-filter="all"]').evaluate(el => el.classList.contains('active'));
  if (!activeHasClass || allHasClass) throw new Error('Active filter pill did not become active!');
  let activeRows = await page.locator('#stalls-table-body tr').count();
  console.log(`PASS: Active filter pill clicked. Active pill highlighted. Visible rows: ${activeRows}`);

  // Tap Trial (1)
  await page.locator('.filter-pill[data-filter="trial"]').click();
  await page.waitForTimeout(300);
  let trialHasClass = await page.locator('.filter-pill[data-filter="trial"]').evaluate(el => el.classList.contains('active'));
  if (!trialHasClass) throw new Error('Trial filter pill did not become active!');
  let trialRows = await page.locator('#stalls-table-body tr').count();
  console.log(`PASS: Trial filter pill clicked. Visible rows: ${trialRows}`);

  // Tap Due Soon (1)
  await page.locator('.filter-pill[data-filter="expiring"]').click();
  await page.waitForTimeout(300);
  let expiringHasClass = await page.locator('.filter-pill[data-filter="expiring"]').evaluate(el => el.classList.contains('active'));
  if (!expiringHasClass) throw new Error('Due Soon filter pill did not become active!');
  console.log('PASS: Due Soon filter pill clicked.');

  // Tap All (6)
  await page.locator('.filter-pill[data-filter="all"]').click();
  await page.waitForTimeout(300);
  allHasClass = await page.locator('.filter-pill[data-filter="all"]').evaluate(el => el.classList.contains('active'));
  if (!allHasClass) throw new Error('All filter pill did not re-activate!');
  let allRows = await page.locator('#stalls-table-body tr').count();
  console.log(`PASS: All filter pill re-activated. Visible rows: ${allRows}`);

  await page.screenshot({ path: path.join(screenshotDir, '01_vendors_filter_pills_verified_390x844.png') });
  console.log('Captured: 01_vendors_filter_pills_verified_390x844.png');

  // 3. Test "Add a New Restaurant" dedicated page transition
  console.log('Testing "Add a New Restaurant" button transition...');
  await page.locator('#btn-top-add-stall').click();
  await page.waitForTimeout(400);

  let isAddPageVisible = await page.locator('#view-add-restaurant').isVisible();
  let isVendorsHidden = !await page.locator('#view-vendors').isVisible();
  if (!isAddPageVisible || !isVendorsHidden) {
    throw new Error('Failed to transition to full-page #view-add-restaurant!');
  }
  console.log('PASS: Successfully transitioned to full-page #view-add-restaurant!');

  // 4. Verify Single-Column Layout & Zero Horizontal Overflow
  const formBox = await page.locator('#form-add-stall-page').boundingBox();
  const formScrollWidth = await page.locator('#form-add-stall-page').evaluate(el => el.scrollWidth);
  const formClientWidth = await page.locator('#form-add-stall-page').evaluate(el => el.clientWidth);

  console.log(`Form dimensions: width=${formBox.width}, scrollWidth=${formScrollWidth}, clientWidth=${formClientWidth}`);
  if (formScrollWidth > formClientWidth + 1) {
    throw new Error(`HORIZONTAL OVERFLOW DETECTED: scrollWidth (${formScrollWidth}) > clientWidth (${formClientWidth})!`);
  }
  console.log('PASS: Form is strict single-column with ZERO horizontal overflow!');

  await page.screenshot({ path: path.join(screenshotDir, '02_add_restaurant_full_page_top_390x844.png') });
  console.log('Captured: 02_add_restaurant_full_page_top_390x844.png');

  // 5. Test "Back to Vendors" button
  console.log('Testing "Back to Vendors" button...');
  await page.locator('#btn-back-to-vendors').click();
  await page.waitForTimeout(300);
  isVendors = await page.locator('#view-vendors').isVisible();
  isAddPageVisible = await page.locator('#view-add-restaurant').isVisible();
  if (!isVendors || isAddPageVisible) throw new Error('Back to Vendors button failed!');
  console.log('PASS: Back to Vendors returned to #view-vendors.');

  // 6. Test Bottom Dock "+ Add Stall" button
  console.log('Testing Bottom Dock "+ Add Stall" button...');
  await page.locator('#btn-bottom-add-restaurant').click();
  await page.waitForTimeout(300);
  isAddPageVisible = await page.locator('#view-add-restaurant').isVisible();
  if (!isAddPageVisible) throw new Error('Bottom Add Stall button failed to transition to page!');
  console.log('PASS: Bottom Add Stall opened full-page #view-add-restaurant.');

  // 7. Fill out form and submit
  console.log('Filling out Add Restaurant form straight top-to-bottom...');
  await page.locator('#page-add-stall-name').fill('Charminar Irani Chai & Osmania');
  await page.locator('#page-add-owner-name').fill('Syed Mansoor');
  await page.locator('#page-add-phone').fill('9848099111');
  await page.locator('#page-add-city').fill('Old City Hyderabad');
  await page.locator('#page-add-monthly-fee').fill('799');

  await page.locator('#btn-submit-add-stall-page').click();
  await page.waitForTimeout(600);

  // Assert returned to vendors and stall appears
  isVendors = await page.locator('#view-vendors').isVisible();
  if (!isVendors) throw new Error('Did not return to vendors after form submission!');

  const hasNewStall = await page.locator('#stalls-table-body').innerText();
  if (!hasNewStall.includes('Charminar Irani Chai')) {
    throw new Error('New stall not found in vendors table after creation!');
  }
  console.log('PASS: New stall "Charminar Irani Chai" provisioned and rendered in vendors table!');

  await page.screenshot({ path: path.join(screenshotDir, '03_vendors_with_new_stall_390x844.png') });
  console.log('Captured: 03_vendors_with_new_stall_390x844.png');

  await browser.close();
  console.log('ALL VERIFICATIONS COMPLETED WITH 100% SUCCESS!');
}

verifyFeatures().catch(err => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
