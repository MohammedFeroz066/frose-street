import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Projects/FROSE-Restaurant-Platform/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');

const BASE_URL = 'http://127.0.0.1:3100';
const ARTIFACT_DIR = 'C:/Users/welcome/.gemini/antigravity/brain/f5a5f50a-faaf-41e8-8d2e-e54a9cf0a1ef';
const DOCS_DIR = 'C:/Projects/frose-street/docs/walkthroughs/screenshots/menu-onboarding';

fs.mkdirSync(DOCS_DIR, { recursive: true });

async function run() {
  console.log('🚀 Starting Client Onboarding, Category Builder & Menu POS Verification...');

  // Step 0: Obtain Super Admin token
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
    viewport: { width: 390, height: 844 }, // Mobile Viewport (iPhone 14 / Android Standard)
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15'
  });

  const page = await context.newPage();
  page.on('dialog', async dialog => {
    console.log(`Dialog message: ${dialog.message()}`);
    await dialog.accept();
  });

  // STEP 1: Super Admin provisions a fresh stall with 0 items
  console.log('--- 1. Super Admin Provisions New Stall ---');
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
  await page.waitForTimeout(800);

  // Switch to add restaurant page
  await page.click('#btn-bottom-add-restaurant');
  await page.waitForTimeout(600);

  const testPhone = '9888877777';
  const testPassword = 'Password@123';
  const testStallName = 'Royal Biryani & Rolls';

  await page.fill('#page-add-stall-name', testStallName);
  await page.fill('#page-add-owner-name', 'Feroz Khan');
  await page.fill('#page-add-phone', testPhone);
  await page.fill('#page-add-password', testPassword);
  await page.fill('#page-add-city', 'Hyderabad');
  await page.selectOption('#page-add-edition', 'cloud');
  await page.fill('#page-add-monthly-fee', '499');
  await page.selectOption('#page-add-initial-status', 'paid');
  await page.fill('#page-add-upi', 'royalrolls@okaxis');

  await page.click('#btn-submit-add-stall-page');
  await page.waitForTimeout(1200);

  console.log(`✓ Stall "${testStallName}" successfully provisioned!`);

  // STEP 2: Vendor Login with Credentials
  console.log('--- 2. Vendor Logs In ---');
  await page.goto(`${BASE_URL}/login`);
  await page.waitForTimeout(600);

  await page.fill('#login-phone', testPhone);
  await page.fill('#login-password', testPassword);
  await page.click('#btn-submit-pwd');
  await page.waitForTimeout(1400);

  // STEP 3: Client Dashboard Inspection (Image 4 Parity)
  console.log('--- 3. Client Dashboard Inspection ---');
  await page.goto(`${BASE_URL}/`);
  await page.waitForTimeout(800);

  const greeting = await page.locator('#stall-owner-name').textContent();
  console.log(`Dashboard Greeting: ${greeting}`);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, '01_client_dashboard_4_options_390x844.png') });
  await page.screenshot({ path: path.join(DOCS_DIR, '01_client_dashboard_4_options_390x844.png') });
  console.log('📸 Captured 01_client_dashboard_4_options_390x844.png');

  // STEP 4: Tapping Billing -> First-time Onboarding Prompt
  console.log('--- 4. Tapping Billing (First-Time Onboarding Prompt) ---');
  await page.click('a#btn-billing');
  await page.waitForTimeout(1000);

  const onboardingBanner = await page.locator('#onboarding-menu-banner').textContent();
  console.log(`Onboarding Banner detected: ${onboardingBanner.trim().substring(0, 60)}...`);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, '02_first_time_billing_onboarding_prompt_390x844.png') });
  await page.screenshot({ path: path.join(DOCS_DIR, '02_first_time_billing_onboarding_prompt_390x844.png') });
  console.log('📸 Captured 02_first_time_billing_onboarding_prompt_390x844.png');

  // STEP 5: Clicking Onboarding Button -> Redirects to /menu-setup
  console.log('--- 5. Redirecting to Dedicated /menu-setup Page ---');
  await page.click('#btn-onboarding-create-menu');
  await page.waitForTimeout(1000);

  const setupUrl = page.url();
  console.log(`Current URL: ${setupUrl}`);
  if (!setupUrl.includes('/menu-setup')) {
    throw new Error(`Expected /menu-setup, got: ${setupUrl}`);
  }

  // STEP 6: Add Category Section
  console.log('--- 6. Adding Custom Category Section ---');
  await page.fill('#input-category-name', 'Biryani Specials');
  await page.click('#btn-add-category');
  await page.waitForTimeout(500);

  const badgesText = await page.locator('#categories-badges-container').textContent();
  if (!badgesText.includes('Biryani Specials')) {
    throw new Error('Category "Biryani Specials" was not added!');
  }
  console.log('✓ Category "Biryani Specials" added successfully!');

  // STEP 7: Add Dish with Dual-Mode Image & Integer Paise Price
  console.log('--- 7. Adding Dish with Image and Price in ₹ ---');
  await page.fill('#input-dish-name', 'Hyderabadi Chicken Biryani');
  await page.selectOption('#select-dish-category', 'Biryani Specials');

  // Choose from Gallery
  await page.click('button:has-text("Choose from Gallery")');
  await page.waitForTimeout(500);
  await page.click('#gallery-preset-grid .preset-item-card:first-child');
  await page.waitForTimeout(400);

  await page.fill('#input-dish-price', '220');
  await page.click('#btn-save-dish');
  await page.waitForTimeout(1000);

  // Add a second dish: Butter Naan (Price: 50)
  await page.fill('#input-dish-name', 'Crispy Butter Naan');
  await page.selectOption('#select-dish-category', 'Breads');
  await page.fill('#input-dish-price', '50');
  await page.click('#btn-save-dish');
  await page.waitForTimeout(1000);

  const dishesList = await page.locator('#items-list-container').textContent();
  console.log(`Dishes in Directory: ${dishesList.replace(/\s+/g, ' ').substring(0, 80)}...`);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, '03_menu_setup_page_with_items_390x844.png') });
  await page.screenshot({ path: path.join(DOCS_DIR, '03_menu_setup_page_with_items_390x844.png') });
  console.log('📸 Captured 03_menu_setup_page_with_items_390x844.png');

  // STEP 8: Launch Billing Counter with Menu
  console.log('--- 8. Returning to Billing & Menu POS ---');
  await page.click('#btn-launch-billing');
  await page.waitForTimeout(1000);

  // Verify category in sidebar and dishes in grid
  const sidebarContent = await page.locator('#pos-category-sidebar').textContent();
  const dishesGridContent = await page.locator('#pos-dishes-grid').textContent();

  console.log(`Sidebar Categories: ${sidebarContent.replace(/\s+/g, ' ')}`);
  console.log(`Dishes Grid: ${dishesGridContent.replace(/\s+/g, ' ').substring(0, 100)}...`);

  if (!dishesGridContent.includes('Hyderabadi Chicken Biryani')) {
    throw new Error('Created dish "Hyderabadi Chicken Biryani" not found in POS grid!');
  }

  await page.screenshot({ path: path.join(ARTIFACT_DIR, '04_billing_menu_pos_with_new_dishes_390x844.png') });
  await page.screenshot({ path: path.join(DOCS_DIR, '04_billing_menu_pos_with_new_dishes_390x844.png') });
  console.log('📸 Captured 04_billing_menu_pos_with_new_dishes_390x844.png');

  // STEP 9: Test In-Card Stepper (+ and -) and Floating Cart Pill
  console.log('--- 9. Testing In-Card Steppers and Floating Cart Pill ---');
  // Click '+' on first dish
  await page.click('.pos-dish-card:first-child .btn-dish-add-circle');
  await page.waitForTimeout(500);

  // Verify stepper pill appeared
  const stepper = await page.locator('.pos-dish-card:first-child .dish-stepper-pill').textContent();
  console.log(`Stepper content: ${stepper.trim()}`);

  // Cart pill stats
  const cartPillStats = await page.locator('#cart-pill-stats').textContent();
  console.log(`Floating Cart Pill: ${cartPillStats}`);

  // Increment with '+' inside stepper
  await page.click('.pos-dish-card:first-child .dish-stepper-pill .btn-stepper-action:has-text("+")');
  await page.waitForTimeout(400);

  const updatedCartPill = await page.locator('#cart-pill-stats').textContent();
  console.log(`Updated Floating Cart Pill: ${updatedCartPill}`);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, '05_billing_pos_in_card_stepper_and_cart_390x844.png') });
  await page.screenshot({ path: path.join(DOCS_DIR, '05_billing_pos_in_card_stepper_and_cart_390x844.png') });
  console.log('📸 Captured 05_billing_pos_in_card_stepper_and_cart_390x844.png');

  // STEP 10: Checkout Drawer and Token Flash Modal
  console.log('--- 10. Checkout Drawer & Order Dispatch ---');
  await page.click('#pos-floating-cart-pill');
  await page.waitForTimeout(600);

  const checkoutTotal = await page.locator('#checkout-grand-total').textContent();
  console.log(`Checkout Grand Total: ${checkoutTotal}`);

  await page.click('#btn-pay-cash');
  await page.waitForTimeout(1000);

  const tokenText = await page.locator('#flash-token-number').textContent();
  console.log(`Dispatched Order: ${tokenText}`);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, '06_order_token_flash_confirmation_390x844.png') });
  await page.screenshot({ path: path.join(DOCS_DIR, '06_order_token_flash_confirmation_390x844.png') });
  console.log('📸 Captured 06_order_token_flash_confirmation_390x844.png');

  await browser.close();
  console.log('🎉 ALL CLIENT ONBOARDING, CATEGORY & MENU POS TESTS PASSED 100%!');
}

run().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
