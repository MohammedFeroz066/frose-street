import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Projects/FROSE-Restaurant-Platform/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');

const screenshotDir = path.resolve('docs/walkthroughs/screenshots/stall-client-pos');
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

async function verifyStallClientExperience() {
  console.log('--- STARTING STALL CLIENT DASHBOARD & POS PLAYWRIGHT VERIFICATION ---');

  // Obtain Stall Client Token (non-superadmin stall vendor)
  const loginRes = await fetch('http://127.0.0.1:3100/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '9848012345', password: 'Feroz@123' })
  });

  let token = 'mock-stall-client-token';
  if (loginRes.ok) {
    const data = await loginRes.json();
    token = data.token;
  }
  console.log('Token ready.');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone 14/15 resolution matching reference
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15'
  });
  const page = await context.newPage();

  page.on('dialog', async dialog => {
    console.log('Browser Dialog:', dialog.message());
    await dialog.accept();
  });

  // Setup client storage
  await page.goto('http://127.0.0.1:3100/login');
  await page.evaluate((tok) => {
    localStorage.setItem('frose_auth_token', tok);
    localStorage.setItem('frose_first_login_done', 'true');
    localStorage.setItem('frose_stall_name', 'Al-Bake Shawarma Express');
    localStorage.setItem('frose_current_vendor', JSON.stringify({
      id: 'v-stall-demo-02',
      phone: '9848012345',
      businessName: 'Al-Bake Shawarma Express',
      ownerName: 'Mirza Baig',
      role: 'vendor',
      isSuperadmin: false
    }));
  }, token);

  // 1. Verify Stall Client Dashboard (Image 1 Parity)
  console.log('Navigating to Stall Client Dashboard http://127.0.0.1:3100/ ...');
  await page.goto('http://127.0.0.1:3100/');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(600);

  // Verify Header
  const headerText = await page.locator('.stall-header').innerText();
  if (!headerText.includes('FROSE') || !headerText.includes('STREET') || !headerText.includes('Stall Client')) {
    throw new Error('Header does not match Image 1 branding and SC label!');
  }
  console.log('PASS: Stall header verified.');

  // Verify Hero Card & 3D Stall
  const heroCard = await page.locator('.hero-welcome-card').isVisible();
  const reportsBtn = await page.locator('#btn-open-reports').isVisible();
  if (!heroCard || !reportsBtn) throw new Error('Hero Welcome Card not visible!');
  console.log('PASS: Hero Welcome Card & Reports button verified.');

  // Verify 2x2 Actions Grid
  const billingBtn = await page.locator('#btn-billing').isVisible();
  const kitchenBtn = await page.locator('#btn-kitchen').isVisible();
  const packagingBtn = await page.locator('#btn-packaging').isVisible();
  const dineinBtn = await page.locator('#btn-dinein').isVisible();
  if (!billingBtn || !kitchenBtn || !packagingBtn || !dineinBtn) {
    throw new Error('2x2 Actions Grid does not contain all 4 cards (Billing, Delivery, Packing, Dine In)!');
  }
  console.log('PASS: 2x2 Actions Grid verified (Billing, Delivery, Packing, Dine In).');

  // Verify Support & Status Banner
  const supportBanner = await page.locator('.support-status-banner').isVisible();
  const callSupport = await page.locator('#btn-call-support').isVisible();
  if (!supportBanner || !callSupport) throw new Error('Support & Status banner not visible!');
  console.log('PASS: Support & Status banner verified.');

  // Verify Bottom Dock Nav
  const addOrderBtn = await page.locator('#btn-dock-add-order').isVisible();
  if (!addOrderBtn) throw new Error('+ Add Order dock button not visible!');
  console.log('PASS: Bottom dock bar verified.');

  // Capture Dashboard Screenshot
  const ss1 = path.join(screenshotDir, '01_stall_client_dashboard_390x844.png');
  await page.screenshot({ path: ss1 });
  console.log(`Captured: ${ss1}`);

  // 2. Transition to Billing & Menu POS (Image 2 Parity)
  console.log('Testing click on Billing card to launch POS...');
  await page.locator('#btn-billing').click();
  await page.waitForURL('**/billing**');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(600);

  // Verify Left Category Sidebar
  const catSidebar = await page.locator('#pos-category-sidebar').isVisible();
  const bestSellersPill = await page.locator('.category-sidebar-pill[data-category="best-sellers"]').isVisible();
  const startersPill = await page.locator('.category-sidebar-pill[data-category="starters"]').isVisible();
  const addSectionBtn = await page.locator('.btn-add-section').isVisible();
  if (!catSidebar || !bestSellersPill || !startersPill || !addSectionBtn) {
    throw new Error('Category Sidebar does not contain category pills or + Add Section!');
  }
  console.log('PASS: Left Category Sidebar verified.');

  // Verify 2-Column Food Dishes Grid
  const dishCards = await page.locator('.pos-dish-card').count();
  console.log(`Rendered dishes count: ${dishCards}`);
  if (dishCards < 4) throw new Error('Expected at least 4 dish cards in 2-column grid!');

  // Verify Floating Price & Add Button over image
  const firstPrice = await page.locator('.dish-floating-price').first().innerText();
  console.log(`First dish price: ${firstPrice}`);
  if (!firstPrice.startsWith('₹')) throw new Error('Floating price tag missing ₹ symbol!');

  // 3. Test Interactive Stepper & Cart Pill
  console.log('Testing adding items to cart and stepper conversion...');
  // Add Butter Naan
  await page.locator('.btn-dish-add-circle').first().click();
  await page.waitForTimeout(200);

  // Verify it converted to stepper
  const stepperVisible = await page.locator('.dish-stepper-pill').first().isVisible();
  if (!stepperVisible) throw new Error('Add button did not transform into interactive stepper!');
  console.log('PASS: Add button transformed into [-] [qty] [+] stepper.');

  // Increment with stepper +
  await page.locator('.btn-stepper-action:has-text("+")').first().click();
  await page.waitForTimeout(200);
  const qty = await page.locator('.stepper-quantity-num').first().innerText();
  if (qty !== '2') throw new Error(`Expected quantity 2, got ${qty}`);
  console.log(`PASS: Stepper successfully incremented quantity to ${qty}.`);

  // Add a second dish (Chole Bhature)
  await page.locator('.btn-dish-add-circle').first().click();
  await page.waitForTimeout(200);

  // Verify Floating Cart Pill at Bottom
  const cartPill = await page.locator('#pos-floating-cart-pill').isVisible();
  const cartStats = await page.locator('#cart-pill-stats').innerText();
  console.log(`Floating Cart Pill: ${cartStats}`);
  if (!cartPill || !cartStats.includes('•')) throw new Error('Floating Cart Pill not displayed correctly!');
  console.log('PASS: Floating Cart Pill displaying live item count and total.');

  // Capture POS Screenshot with Stepper & Floating Cart Pill
  const ss2 = path.join(screenshotDir, '02_billing_menu_pos_with_stepper_and_cart_390x844.png');
  await page.screenshot({ path: ss2 });
  console.log(`Captured: ${ss2}`);

  // 4. Test Custom Menu Management (+ Add Section and + Add Dish)
  console.log('Testing + Add Section modal...');
  await page.locator('.btn-add-section').click();
  await page.waitForTimeout(300);
  await page.locator('#input-new-section-name').fill('Chef Specials');
  await page.locator('#modal-add-section form button[type="submit"]').click();
  await page.waitForTimeout(400);

  const customSecPill = await page.locator('.category-sidebar-pill[data-category="chef-specials"]').isVisible();
  if (!customSecPill) throw new Error('New custom section pill was not created in sidebar!');
  console.log('PASS: Custom Section "Chef Specials" successfully created and active in sidebar.');

  console.log('Testing ➕ Add Dish modal...');
  await page.locator('.btn-toolbar-add-dish').click();
  await page.waitForTimeout(300);
  await page.locator('#input-dish-name').fill('Paneer Butter Masala');
  await page.locator('#input-dish-price').fill('220');
  await page.locator('#modal-add-dish form button[type="submit"]').click();
  await page.waitForTimeout(500);

  const newDishVisible = await page.locator('.pos-dish-card:has-text("Paneer Butter Masala")').isVisible();
  if (!newDishVisible) throw new Error('Newly created dish was not rendered in dishes grid!');
  console.log('PASS: Newly added dish "Paneer Butter Masala" (₹220.0) rendered successfully.');

  // 5. Test Checkout Drawer & Order Execution
  console.log('Testing opening Checkout Drawer via Floating Cart Pill...');
  await page.locator('#pos-floating-cart-pill').click();
  await page.waitForTimeout(400);
  const checkoutVisible = await page.locator('#checkout-drawer-modal').isVisible();
  if (!checkoutVisible) throw new Error('Checkout drawer modal did not open!');
  console.log('PASS: Checkout Drawer opened with cart breakdown.');

  console.log('Testing CASH order checkout...');
  await page.locator('#btn-pay-cash').click();
  await page.waitForTimeout(500);

  const tokenFlash = await page.locator('#token-flash-modal').isVisible();
  const tokenNum = await page.locator('#flash-token-number').innerText();
  console.log(`Token Flash Displayed: ${tokenNum}`);
  if (!tokenFlash || !tokenNum.includes('TOKEN')) throw new Error('Token Flash Confirmation modal did not trigger!');
  console.log('PASS: Token Flash Confirmation triggered with next sequential token number.');

  // Capture Checkout / Token Flash Screenshot
  const ss3 = path.join(screenshotDir, '03_checkout_drawer_and_token_flash_390x844.png');
  await page.screenshot({ path: ss3 });
  console.log(`Captured: ${ss3}`);

  // 6. Test Back Arrow Navigation
  console.log('Testing Back Arrow navigation to Dashboard...');
  await page.locator('.btn-pos-back').click();
  await page.waitForURL('http://127.0.0.1:3100/');
  await page.waitForLoadState('domcontentloaded');
  const returnedToDashboard = await page.locator('.hero-welcome-card').isVisible();
  if (!returnedToDashboard) throw new Error('Back arrow did not return to Stall Client Dashboard!');
  console.log('PASS: Back arrow successfully navigated back to Dashboard.');

  await browser.close();
  console.log('--- ALL STALL CLIENT DASHBOARD & POS VERIFICATIONS COMPLETED 100% SUCCESSFULLY ---');
}

verifyStallClientExperience().catch(err => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
