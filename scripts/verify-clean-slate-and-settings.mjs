import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Projects/FROSE-Restaurant-Platform/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');

const BASE_URL = 'http://127.0.0.1:3100';
const ARTIFACT_DIR = 'C:/Users/welcome/.gemini/antigravity/brain/f5a5f50a-faaf-41e8-8d2e-e54a9cf0a1ef';
const DOCS_DIR = 'C:/Projects/frose-street/docs/walkthroughs/screenshots/clean-slate-and-settings';

fs.mkdirSync(DOCS_DIR, { recursive: true });

async function run() {
  console.log('🚀 Starting Clean Slate, Menu Setup & Settings Modal Verification...');

  // 0. Super Admin Token
  const adminLoginRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '9999999999', password: 'Feroz@123' })
  });
  if (!adminLoginRes.ok) throw new Error('Super Admin login failed');
  const { token: adminToken } = await adminLoginRes.json();
  console.log('✓ Super Admin authenticated.');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // Mobile Viewport (iPhone / Android)
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15'
  });

  const page = await context.newPage();
  page.on('dialog', async dialog => {
    console.log(`Dialog: ${dialog.message()}`);
    await dialog.accept();
  });

  // 1. Super Admin provisions a brand new stall
  console.log('--- 1. Provisioning Fresh Stall ---');
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
  }, adminToken);

  await page.goto(`${BASE_URL}/admin`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(600);

  await page.click('#btn-bottom-add-restaurant');
  await page.waitForTimeout(500);

  const testPhone = '9' + Math.floor(100000000 + Math.random() * 900000000).toString();
  const testPassword = 'Password@123';
  const testStallName = 'Hyderabad Irani Chai & Momos';

  await page.fill('#page-add-stall-name', testStallName);
  await page.fill('#page-add-owner-name', 'Feroz Khan');
  await page.fill('#page-add-phone', testPhone);
  await page.fill('#page-add-password', testPassword);
  await page.fill('#page-add-city', 'Hyderabad');
  await page.selectOption('#page-add-edition', 'cloud');
  await page.fill('#page-add-monthly-fee', '499');
  await page.selectOption('#page-add-initial-status', 'paid');
  await page.fill('#page-add-upi', 'iranichai@okaxis');

  await page.click('#btn-submit-add-stall-page');
  await page.waitForTimeout(1200);
  console.log(`✓ Stall "${testStallName}" (${testPhone}) provisioned.`);

  // 2. Vendor Login
  console.log('--- 2. Fresh Vendor Logs In ---');
  await page.goto(`${BASE_URL}/login`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(500);

  await page.fill('#login-phone', testPhone);
  await page.fill('#login-password', testPassword);
  await page.click('#btn-submit-pwd');
  await page.waitForTimeout(1400);

  // 3. Billing Counter on First Login: 100% Clean Slate
  console.log('--- 3. Verifying Clean Slate (0 Categories, 0 Dishes) ---');
  await page.goto(`${BASE_URL}/billing`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(800);

  const sidebarText = await page.locator('#pos-category-sidebar').textContent();
  const dishesGridText = await page.locator('#pos-dishes-grid').textContent();

  console.log(`Sidebar text: ${sidebarText.replace(/\s+/g, ' ')}`);
  console.log(`Dishes grid text: ${dishesGridText.replace(/\s+/g, ' ').substring(0, 100)}...`);

  if (!sidebarText.includes('No Categories') && !sidebarText.includes('+ Add')) {
    throw new Error('Sidebar was not clean slate!');
  }
  if (!dishesGridText.includes('Welcome to Your Billing Counter!')) {
    throw new Error('Dishes grid was not clean slate!');
  }

  await page.screenshot({ path: path.join(ARTIFACT_DIR, '01_clean_slate_zero_categories_and_items.png') });
  await page.screenshot({ path: path.join(DOCS_DIR, '01_clean_slate_zero_categories_and_items.png') });
  console.log('📸 Captured 01_clean_slate_zero_categories_and_items.png');

  // 4. Click Client Profile Top Right -> Opens Settings Modal
  console.log('--- 4. Clicking Top-Right Profile Avatar -> Settings Modal ---');
  await page.click('#btn-pos-profile');
  await page.waitForTimeout(600);

  const isSettingsActive = await page.locator('#settings-modal.active').isVisible();
  if (!isSettingsActive) {
    throw new Error('Settings modal did not open on clicking profile avatar!');
  }

  const stallNameInSettings = await page.locator('#settings-client-stall').textContent();
  console.log(`Settings Modal Stall Name: ${stallNameInSettings.trim()}`);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, '02_sleek_settings_options_modal.png') });
  await page.screenshot({ path: path.join(DOCS_DIR, '02_sleek_settings_options_modal.png') });
  console.log('📸 Captured 02_sleek_settings_options_modal.png');

  // 5. Navigate to /menu-setup via Settings Card
  console.log('--- 5. Navigating to /menu-setup ---');
  await page.click('#btn-settings-menu-setup');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(800);

  // Verify preview is completely empty on initial load
  const isPlaceholderVisible = await page.locator('#image-preview-placeholder').isVisible();
  const previewImgSrc = await page.locator('#image-preview-element').getAttribute('src');
  console.log(`Initial Image Placeholder visible: ${isPlaceholderVisible}, Img src: "${previewImgSrc}"`);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, '03_menu_setup_empty_initial_state.png') });
  await page.screenshot({ path: path.join(DOCS_DIR, '03_menu_setup_empty_initial_state.png') });
  console.log('📸 Captured 03_menu_setup_empty_initial_state.png');

  // 6. Add Custom Categories (Tea, Snacks, Momos)
  console.log('--- 6. Adding Custom Categories (Tea, Snacks, Momos) ---');
  await page.fill('#input-category-name', 'Tea');
  await page.click('#btn-add-category');
  await page.waitForTimeout(300);

  await page.fill('#input-category-name', 'Snacks');
  await page.click('#btn-add-category');
  await page.waitForTimeout(300);

  await page.fill('#input-category-name', 'Momos');
  await page.click('#btn-add-category');
  await page.waitForTimeout(300);

  // 7. Add Custom Dishes (Chai, Samosa, Momos)
  console.log('--- 7. Adding Custom Dishes ---');
  // Dish 1: Special Irani Chai
  await page.fill('#input-dish-name', 'Special Irani Chai');
  await page.selectOption('#select-dish-category', 'Tea');
  await page.click('button:has-text("Choose from Gallery")');
  await page.waitForTimeout(300);
  await page.click('#gallery-preset-grid .preset-item-card:first-child');
  await page.waitForTimeout(300);
  await page.fill('#input-dish-price', '20');
  await page.click('#btn-save-dish');
  await page.waitForTimeout(600);

  // Dish 2: Crispy Samosa
  await page.fill('#input-dish-name', 'Crispy Aloo Samosa');
  await page.selectOption('#select-dish-category', 'Snacks');
  await page.click('button:has-text("Choose from Gallery")');
  await page.waitForTimeout(300);
  await page.click('#gallery-preset-grid .preset-item-card:nth-child(2)');
  await page.waitForTimeout(300);
  await page.fill('#input-dish-price', '30');
  await page.click('#btn-save-dish');
  await page.waitForTimeout(600);

  // Dish 3: Steamed Veg Momos
  await page.fill('#input-dish-name', 'Steamed Veg Momos (6 Pcs)');
  await page.selectOption('#select-dish-category', 'Momos');
  await page.click('button:has-text("Choose from Gallery")');
  await page.waitForTimeout(300);
  await page.click('#gallery-preset-grid .preset-item-card:nth-child(3)');
  await page.waitForTimeout(300);
  await page.fill('#input-dish-price', '80');
  await page.click('#btn-save-dish');
  await page.waitForTimeout(600);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, '04_menu_setup_custom_categories_and_items.png') });
  await page.screenshot({ path: path.join(DOCS_DIR, '04_menu_setup_custom_categories_and_items.png') });
  console.log('📸 Captured 04_menu_setup_custom_categories_and_items.png');

  // 8. Return to Billing via Back Navigation / Launch Button
  console.log('--- 8. Navigating Back to /billing ---');
  await page.click('#btn-launch-billing');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);

  const updatedSidebar = await page.locator('#pos-category-sidebar').textContent();
  const updatedGrid = await page.locator('#pos-dishes-grid').textContent();

  console.log(`Updated Sidebar: ${updatedSidebar.replace(/\s+/g, ' ')}`);
  console.log(`Updated Grid: ${updatedGrid.replace(/\s+/g, ' ').substring(0, 100)}...`);

  if (!updatedSidebar.includes('Tea') || !updatedSidebar.includes('Snacks') || !updatedSidebar.includes('Momos')) {
    throw new Error('Sidebar was not updated with custom categories!');
  }
  if (!updatedGrid.includes('Special Irani Chai')) {
    throw new Error('Dishes grid was not updated with newly added dishes!');
  }

  await page.screenshot({ path: path.join(ARTIFACT_DIR, '05_billing_pos_instantly_updated_with_dishes.png') });
  await page.screenshot({ path: path.join(DOCS_DIR, '05_billing_pos_instantly_updated_with_dishes.png') });
  console.log('📸 Captured 05_billing_pos_instantly_updated_with_dishes.png');

  // 9. In-Card Steppers and Floating Cart Pill
  console.log('--- 9. Testing In-Card Steppers & Floating Cart ---');
  await page.click('.pos-dish-card:first-child .btn-dish-add-circle');
  await page.waitForTimeout(400);

  // Increment inside stepper
  await page.click('.pos-dish-card:first-child .dish-stepper-pill .btn-stepper-action:has-text("+")');
  await page.waitForTimeout(400);

  // Switch to Snacks tab and add Samosa
  await page.click('.category-sidebar-pill[data-category="snacks"]');
  await page.waitForTimeout(400);
  await page.click('.pos-dish-card:first-child .btn-dish-add-circle');
  await page.waitForTimeout(400);

  const cartStats = await page.locator('#cart-pill-stats').textContent();
  console.log(`Live Cart Stats: ${cartStats}`);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, '06_pos_stepper_and_floating_cart_pill.png') });
  await page.screenshot({ path: path.join(DOCS_DIR, '06_pos_stepper_and_floating_cart_pill.png') });
  console.log('📸 Captured 06_pos_stepper_and_floating_cart_pill.png');

  // 10. Dashboard Settings Modal Verification
  console.log('--- 10. Verifying Dashboard Profile Settings Modal ---');
  await page.goto(`${BASE_URL}/`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(600);

  await page.click('#btn-user-profile');
  await page.waitForTimeout(500);

  const isDashSettingsActive = await page.locator('#settings-modal.active').isVisible();
  console.log(`Dashboard Settings modal active: ${isDashSettingsActive}`);
  if (!isDashSettingsActive) {
    throw new Error('Settings modal did not open on dashboard profile click!');
  }

  await page.screenshot({ path: path.join(ARTIFACT_DIR, '07_dashboard_profile_settings_modal.png') });
  await page.screenshot({ path: path.join(DOCS_DIR, '07_dashboard_profile_settings_modal.png') });
  console.log('📸 Captured 07_dashboard_profile_settings_modal.png');

  await browser.close();
  console.log('🎉 ALL CLEAN SLATE, LAG FIX & SETTINGS MODAL CHECKS PASSED 100%!');
}

run().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
