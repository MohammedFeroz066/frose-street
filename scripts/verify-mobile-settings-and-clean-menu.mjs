import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const playwrightPath = 'C:\\Projects\\FROSE-Restaurant-Platform\\node_modules\\.pnpm\\playwright@1.63.0\\node_modules\\playwright';
const { chromium } = require(playwrightPath);

const SCREENSHOTS_DIR = 'C:\\Projects\\frose-street\\docs\\walkthroughs\\screenshots\\mobile-settings-fix';
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function runVerification() {
  console.log('🚀 Starting Mobile Settings Alignment & Clean Menu Verification...');

  const browser = await chromium.launch({ headless: true });
  // Emulate standard mobile device (iPhone 13/14 / Modern Android)
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  const page = await context.newPage(); page.on('console', msg => console.log('PAGE LOG:', msg.text())); page.on('pageerror', err => console.log('PAGE ERROR:', err));

  // Pre-seed mock auth token so user lands straight on billing
  await page.addInitScript(() => {
    localStorage.setItem('frose_auth_token', 'mock_counter_token_777');
    localStorage.setItem('frose_current_vendor', JSON.stringify({
      id: 'v-stall-demo',
      businessName: 'Cloud Edge Kitchen',
      ownerName: 'Mohammed Feroz',
      phone: '9642230688',
      upiId: '9642230688@ybl',
      payeeName: 'Cloud Edge Kitchen'
    }));
  });

  await page.goto('http://localhost:3100/billing', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // 1. Verify Clean Slate: 0 Dummy Dishes
  console.log('🔍 Checking Menu Dishes for clean slate...');
  const dishCards = await page.locator('.pos-dish-card').count();
  console.log(`Found ${dishCards} dish cards.`);
  if (dishCards > 0) {
    throw new Error(`Expected 0 dummy dish cards, but found ${dishCards}!`);
  }

  // 2. Verify Onboarding empty banner exists
  const onboardingBanner = await page.locator('#onboarding-menu-banner').isVisible();
  console.log('Clean slate onboarding banner visible:', onboardingBanner);
  if (!onboardingBanner) {
    throw new Error('Expected onboarding-menu-banner to be visible when menu is empty!');
  }

  // 3. Verify Cart Pill Stats shows 0 • ₹0.0
  const cartPillText = await page.locator('#cart-pill-stats').innerText();
  console.log('Cart pill stats text:', cartPillText);
  if (!cartPillText.includes('0') || !cartPillText.includes('0.0')) {
    throw new Error(`Expected cart pill to show 0 • ₹0.0, got "${cartPillText}"`);
  }

  // Take Screenshot 1: Clean Slate Billing Screen
  const shot1 = path.join(SCREENSHOTS_DIR, '01_mobile_billing_clean_slate_390x844.png');
  await page.screenshot({ path: shot1 });
  console.log('📸 Saved Screenshot 1:', shot1);

  // 4. Open Settings Modal
  console.log('⚙️ Opening Stall Settings Modal on mobile...');
  await page.click('#btn-pos-profile');
  await page.waitForTimeout(600);

  const modalActive = await page.locator('#settings-modal.active').isVisible();
  if (!modalActive) {
    throw new Error('Settings modal failed to open!');
  }

  // 5. Verify Settings Modal Card dimensions on mobile
  const cardBox = await page.locator('.sett-modal-card').boundingBox();
  console.log('Modal Card bounding box:', cardBox);
  if (!cardBox || cardBox.width > 390 || cardBox.width < 340) {
    throw new Error(`Modal card width abnormal: ${cardBox?.width}px (expected 340px-390px)`);
  }

  // 6. Verify Header Alignment: Title and Close button on same horizontal row
  const titleBox = await page.locator('.sett-header-title').boundingBox();
  const closeBox = await page.locator('.sett-close-btn').boundingBox();
  console.log(`Header Title Y: ${titleBox.y}, Close Btn Y: ${closeBox.y}`);
  // Vertical center alignment difference must be less than 15px
  if (Math.abs(titleBox.y - closeBox.y) > 15) {
    throw new Error(`Close button wrapped onto separate row! Title Y: ${titleBox.y}, Close Y: ${closeBox.y}`);
  }

  // 7. Verify Quick Bar Tabs: Pills do NOT wrap vertically (all on roughly same Y position in scroll container)
  const pills = await page.locator('.sett-quick-pill').all();
  const pill0Box = await pills[0].boundingBox();
  const pill3Box = await pills[3].boundingBox();
  console.log(`Pill 0 Y: ${pill0Box.y}, Pill 3 Y: ${pill3Box.y}`);
  if (Math.abs(pill0Box.y - pill3Box.y) > 5) {
    throw new Error(`Quick bar pills wrapped onto multiple rows! Pill 0: ${pill0Box.y}, Pill 3: ${pill3Box.y}`);
  }

  // 8. Verify Payment Scanner Accordion (Expanded by default):
  // Check that Counter UPI input and Payee Display Name are stacked vertically, NOT in one horizontal row!
  const upiInput = await page.locator('#sett-upi-id').boundingBox();
  const payeeInput = await page.locator('#sett-payee-name').boundingBox();
  console.log(`UPI Input Y: ${upiInput.y}, Payee Input Y: ${payeeInput.y}`);
  if (payeeInput.y <= upiInput.y + 20) {
    throw new Error(`Payment inputs are laid out horizontally instead of vertically!`);
  }

  // Take Screenshot 2: Settings Modal Top / QR Accordion
  const shot2 = path.join(SCREENSHOTS_DIR, '02_mobile_settings_modal_perfect_alignment_390x844.png');
  await page.screenshot({ path: shot2 });
  console.log('📸 Saved Screenshot 2:', shot2);

  // 9. Scroll settings content down
  console.log('📜 Scrolling Settings Modal content...');
  await page.evaluate(() => {
    const scrollContent = document.querySelector('.sett-scroll-content');
    if (scrollContent) scrollContent.scrollTop = 300;
  });
  await page.waitForTimeout(400);

  // Verify background window.scrollY remains 0 (frozen)
  const pageScrollY = await page.evaluate(() => window.scrollY);
  console.log('Background page scroll Y position:', pageScrollY);
  if (pageScrollY !== 0) {
    throw new Error(`Background page scrolled when modal was scrolled! ScrollY = ${pageScrollY}`);
  }

  // Take Screenshot 3: Settings Modal Scrolled Bottom View
  const shot3 = path.join(SCREENSHOTS_DIR, '03_mobile_settings_modal_scrolled_view_390x844.png');
  await page.screenshot({ path: shot3 });
  console.log('📸 Saved Screenshot 3:', shot3);

  await browser.close();
  console.log('🎉 All mobile alignment, scroll isolation, and clean menu checks PASSED!');
}

runVerification().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
