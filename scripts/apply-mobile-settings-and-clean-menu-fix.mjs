import fs from 'node:fs';
import path from 'node:path';

const projectRoot = 'C:\\Projects\\frose-street';

// 1. Update client/billing.html
{
  const filePath = path.join(projectRoot, 'client', 'billing.html');
  let content = fs.readFileSync(filePath, 'utf8');

  // A. Purge key and CSS version
  content = content.replace(
    /var PURGE_KEY = 'frose_clean_slate_2026_v12';[\s\S]*?localStorage\.setItem\(PURGE_KEY, 'true'\);\s*}/,
    `var PURGE_KEY = 'frose_clean_slate_2026_v99_permanent_empty';
      if (!localStorage.getItem(PURGE_KEY)) {
        for (var i = localStorage.length - 1; i >= 0; i--) {
          var k = localStorage.key(i);
          if (k && (k.indexOf('frose_dishes') === 0 || k.indexOf('frose_cats') === 0 || k === 'frose_custom_menu_catalog' || k.indexOf('frose_menu') === 0)) {
            localStorage.removeItem(k);
          }
        }
        localStorage.setItem(PURGE_KEY, 'true');
      }`
  );

  content = content.replace('/css/style.css?v=7.0.0', '/css/style.css?v=8.0.0');

  // B. Bulletproof settings modal styles
  const bulletproofCSS = `<style id="frose-settings-bulletproof-css">
  /* Apple iOS 120fps Fluid View Transitions & Instant Touch Responsiveness */
  @view-transition {
    navigation: auto;
  }
  html {
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }
  ::view-transition-old(root) {
    animation: 200ms cubic-bezier(0.32, 0.72, 0, 1) both iosSlideOut;
  }
  ::view-transition-new(root) {
    animation: 240ms cubic-bezier(0.32, 0.72, 0, 1) both iosSlideIn;
  }
  @keyframes iosSlideOut {
    from { opacity: 1; transform: translate3d(0, 0, 0); }
    to { opacity: 0.88; transform: translate3d(-18%, 0, 0); }
  }
  @keyframes iosSlideIn {
    from { opacity: 0; transform: translate3d(100%, 0, 0); }
    to { opacity: 1; transform: translate3d(0, 0, 0); }
  }
  .pos-main-container, .stall-dashboard-container {
    animation: iosPageEnter 0.22s cubic-bezier(0.32, 0.72, 0, 1) forwards;
    will-change: transform, opacity;
  }
  @keyframes iosPageEnter {
    from { opacity: 0; transform: translate3d(0, 6px, 0); }
    to { opacity: 1; transform: translate3d(0, 0, 0); }
  }

  /* 100% Guaranteed Bulletproof Inline Styles for Settings Modal (Design 3) */
  html.modal-open,
  body.modal-open {
    position: fixed !important;
    width: 100% !important;
    height: 100% !important;
    overflow: hidden !important;
    touch-action: none !important;
  }

  #settings-modal.modal-overlay {
    position: fixed !important;
    inset: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    background: rgba(15, 23, 42, 0.75) !important;
    backdrop-filter: blur(8px) !important;
    -webkit-backdrop-filter: blur(8px) !important;
    z-index: 999999 !important;
    display: none !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 12px !important;
    box-sizing: border-box !important;
    overscroll-behavior: contain !important;
    touch-action: none !important;
  }

  #settings-modal.modal-overlay.active {
    display: flex !important;
  }

  /* Settings Modal Card: Completely decoupled from .modal-card to prevent mobile 320px squash */
  .sett-modal-card {
    width: 95vw !important;
    max-width: 440px !important;
    height: 88vh !important;
    max-height: 720px !important;
    padding: 0 !important;
    border-radius: 20px !important;
    overflow: hidden !important;
    text-align: left !important;
    border: 1px solid rgba(0, 0, 0, 0.12) !important;
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.4) !important;
    background: #FFFFFF !important;
    display: flex !important;
    flex-direction: column !important;
    box-sizing: border-box !important;
    margin: auto !important;
  }

  .sett-header {
    flex-shrink: 0 !important;
    width: 100% !important;
    box-sizing: border-box !important;
    padding: 14px 18px !important;
    background: #FFFFFF !important;
    border-bottom: 1.5px solid #F1F5F9 !important;
    display: flex !important;
    flex-direction: row !important;
    justify-content: space-between !important;
    align-items: center !important;
    text-align: left !important;
  }

  .sett-header-title {
    font-size: 16px !important;
    font-weight: 900 !important;
    color: #0F172A !important;
    letter-spacing: -0.3px !important;
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
    margin: 0 !important;
    text-align: left !important;
  }

  .sett-header-sub {
    font-size: 11.5px !important;
    color: #64748B !important;
    font-weight: 600 !important;
    margin-top: 2px !important;
    text-align: left !important;
  }

  .sett-close-btn {
    width: 32px !important;
    height: 32px !important;
    border-radius: 50% !important;
    border: 1.5px solid #E2E8F0 !important;
    background: #F8FAFC !important;
    font-size: 14px !important;
    font-weight: 900 !important;
    color: #64748B !important;
    cursor: pointer !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    flex-shrink: 0 !important;
    padding: 0 !important;
    line-height: 1 !important;
  }

  .sett-quick-bar {
    flex-shrink: 0 !important;
    width: 100% !important;
    box-sizing: border-box !important;
    display: flex !important;
    flex-direction: row !important;
    flex-wrap: nowrap !important;
    gap: 8px !important;
    padding: 10px 14px !important;
    background: #F8FAFC !important;
    border-bottom: 1px solid #E2E8F0 !important;
    overflow-x: auto !important;
    white-space: nowrap !important;
    -webkit-overflow-scrolling: touch !important;
    scrollbar-width: none !important;
  }
  .sett-quick-bar::-webkit-scrollbar { display: none !important; }

  .sett-quick-pill {
    flex: 0 0 auto !important;
    height: 32px !important;
    padding: 0 14px !important;
    border-radius: 18px !important;
    background: #FFFFFF !important;
    border: 1.5px solid #CBD5E1 !important;
    font-size: 11.5px !important;
    font-weight: 800 !important;
    color: #334155 !important;
    cursor: pointer !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 5px !important;
    outline: none !important;
    white-space: nowrap !important;
  }

  .sett-quick-pill.active {
    background: #700A18 !important;
    border-color: #700A18 !important;
    color: #FFFFFF !important;
    box-shadow: 0 2px 6px rgba(112, 10, 24, 0.3) !important;
  }

  /* Scrollable Accordion Content with Isolated Touch Scrolling */
  .sett-scroll-content {
    flex: 1 1 auto !important;
    width: 100% !important;
    box-sizing: border-box !important;
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch !important;
    overscroll-behavior: contain !important;
    touch-action: pan-y !important;
    padding: 14px !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 12px !important;
  }

  .sett-acc-item {
    flex-shrink: 0 !important;
    width: 100% !important;
    box-sizing: border-box !important;
    border: 1.5px solid #E2E8F0 !important;
    border-radius: 14px !important;
    background: #FFFFFF !important;
    box-shadow: 0 1px 3px rgba(0,0,0,0.02) !important;
    overflow: hidden !important;
  }

  .sett-acc-header {
    width: 100% !important;
    box-sizing: border-box !important;
    min-height: 50px !important;
    padding: 12px 14px !important;
    display: flex !important;
    flex-direction: row !important;
    justify-content: space-between !important;
    align-items: center !important;
    cursor: pointer !important;
    background: #FFFFFF !important;
    border-radius: 12px !important;
    text-align: left !important;
  }

  .sett-acc-header.expanded {
    background: #F8FAFC !important;
    border-bottom: 1.5px solid #F1F5F9 !important;
    border-bottom-left-radius: 0 !important;
    border-bottom-right-radius: 0 !important;
  }

  .sett-acc-title-group {
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    gap: 10px !important;
    font-size: 13.5px !important;
    font-weight: 800 !important;
    color: #0F172A !important;
    text-align: left !important;
    flex: 1 !important;
    min-width: 0 !important;
  }

  .sett-acc-chevron {
    width: 24px !important;
    height: 24px !important;
    border-radius: 50% !important;
    background: #F8FAFC !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    font-size: 11px !important;
    color: #64748B !important;
    font-weight: 900 !important;
    flex-shrink: 0 !important;
    margin-left: 8px !important;
  }
  .sett-acc-header.expanded .sett-acc-chevron {
    background: #EFF6FF !important;
    color: #2563EB !important;
    transform: rotate(90deg) !important;
  }

  .sett-acc-body {
    width: 100% !important;
    box-sizing: border-box !important;
    padding: 14px !important;
    background: #FFFFFF !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 12px !important;
    text-align: left !important;
  }

  .sett-input-group {
    width: 100% !important;
    box-sizing: border-box !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 5px !important;
    text-align: left !important;
  }

  .sett-label {
    font-size: 12px !important;
    font-weight: 800 !important;
    color: #334155 !important;
    display: block !important;
    text-align: left !important;
  }

  .sett-input {
    width: 100% !important;
    box-sizing: border-box !important;
    height: 42px !important;
    border-radius: 10px !important;
    border: 1.5px solid #CBD5E1 !important;
    padding: 0 12px !important;
    font-size: 13.5px !important;
    font-weight: 600 !important;
    color: #0F172A !important;
    background: #FAFAFA !important;
  }

  .sett-btn-action {
    width: 100% !important;
    box-sizing: border-box !important;
    height: 42px !important;
    border-radius: 10px !important;
    background: #700A18 !important;
    color: #FFFFFF !important;
    font-weight: 800 !important;
    font-size: 13px !important;
    border: none !important;
    cursor: pointer !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 8px !important;
    box-shadow: 0 2px 8px rgba(112, 10, 24, 0.25) !important;
  }

  .sett-btn-secondary {
    width: 100% !important;
    box-sizing: border-box !important;
    height: 38px !important;
    border-radius: 8px !important;
    background: #F1F5F9 !important;
    border: 1px solid #CBD5E1 !important;
    color: #334155 !important;
    font-size: 12px !important;
    font-weight: 800 !important;
    cursor: pointer !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 6px !important;
  }

  .sett-qr-preview-box {
    width: 76px !important;
    height: 76px !important;
    border-radius: 10px !important;
    background: #FFFFFF !important;
    border: 1px solid #CBD5E1 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    overflow: hidden !important;
    flex-shrink: 0 !important;
  }

  .sett-toggle-switch {
    width: 44px !important;
    height: 24px !important;
    border-radius: 24px !important;
    background: #22C55E !important;
    position: relative !important;
    cursor: pointer !important;
    flex-shrink: 0 !important;
    transition: background 0.2s ease !important;
  }
  .sett-toggle-switch.off { background: #CBD5E1 !important; }

  .sett-toggle-switch .toggle-thumb {
    width: 20px !important;
    height: 20px !important;
    border-radius: 50% !important;
    background: #FFFFFF !important;
    position: absolute !important;
    top: 2px !important;
    right: 2px !important;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3) !important;
  }
  .sett-toggle-switch.off .toggle-thumb { right: auto !important; left: 2px !important; }
</style>`;

  content = content.replace(
    /<style id="frose-settings-bulletproof-css">[\s\S]*?<\/style>/,
    bulletproofCSS
  );

  // C. Remove modal-card class from #settings-modal and fix accordion body styles
  content = content.replace(
    '<div class="modal-card sett-modal-card">',
    '<div class="sett-modal-card">'
  );

  // Ensure all sett-acc-body tags have inline flex-direction: column
  content = content.replace(
    /<div class="sett-acc-body" style="display: none;">/g,
    '<div class="sett-acc-body" style="display: none; flex-direction: column; width: 100%; box-sizing: border-box;">'
  );
  content = content.replace(
    /<div class="sett-acc-body" style="display: flex;">/g,
    '<div class="sett-acc-body" style="display: flex; flex-direction: column; width: 100%; box-sizing: border-box;">'
  );

  // D. Update script tags at the bottom to v8.0.0
  content = content.replace('/js/storage-adapter.js?v=7.0.0', '/js/storage-adapter.js?v=8.0.0');
  content = content.replace('/js/billing.js?v=7.0.0', '/js/billing.js?v=8.0.0');
  content = content.replace('/js/ios-fast-nav.js?v=7.0.0', '/js/ios-fast-nav.js?v=8.0.0');
  content = content.replace('<script src="/js/settings-component.js"></script>', '<script src="/js/settings-component.js?v=8.0.0"></script>');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ Updated client/billing.html successfully');
}

// 2. Update client/index.html
{
  const filePath = path.join(projectRoot, 'client', 'index.html');
  let content = fs.readFileSync(filePath, 'utf8');

  content = content.replace('/css/style.css?v=7.0.0', '/css/style.css?v=8.0.0');
  content = content.replace(
    '<div class="modal-card sett-modal-card">',
    '<div class="sett-modal-card">'
  );
  content = content.replace(
    /<div class="sett-acc-body" style="display: none;">/g,
    '<div class="sett-acc-body" style="display: none; flex-direction: column; width: 100%; box-sizing: border-box;">'
  );
  content = content.replace(
    /<div class="sett-acc-body" style="display: flex;">/g,
    '<div class="sett-acc-body" style="display: flex; flex-direction: column; width: 100%; box-sizing: border-box;">'
  );
  content = content.replace('<script src="/js/settings-component.js"></script>', '<script src="/js/settings-component.js?v=8.0.0"></script>');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ Updated client/index.html successfully');
}

// 3. Update client/js/settings-component.js
{
  const filePath = path.join(projectRoot, 'client', 'js', 'settings-component.js');
  let content = fs.readFileSync(filePath, 'utf8');

  // Ensure toggleAccordion and jumpToAccordion set display, flexDirection, width, and boxSizing
  content = content.replace(
    /body\.style\.display = isHidden \? 'flex' : 'none';/,
    `body.style.display = isHidden ? 'flex' : 'none';
        body.style.flexDirection = 'column';
        body.style.width = '100%';
        body.style.boxSizing = 'border-box';`
  );

  content = content.replace(
    /body\.style\.display = 'flex';/,
    `body.style.display = 'flex';
        body.style.flexDirection = 'column';
        body.style.width = '100%';
        body.style.boxSizing = 'border-box';`
  );

  // Update touch listener to include .sett-modal-card and .sett-quick-bar
  content = content.replace(
    /const isInsideScrollable = e\.target\.closest\('\.sett-scroll-content, \.modal-card'\);/,
    `const isInsideScrollable = e.target.closest('.sett-scroll-content, .sett-quick-bar, .sett-modal-card');`
  );

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ Updated client/js/settings-component.js successfully');
}

// 4. Update client/js/billing.js
{
  const filePath = path.join(projectRoot, 'client', 'js', 'billing.js');
  let content = fs.readFileSync(filePath, 'utf8');

  // Update PURGE_KEY
  content = content.replace(
    "const PURGE_KEY = 'frose_clean_slate_2026_v12';",
    "const PURGE_KEY = 'frose_clean_slate_2026_v99_permanent_empty';"
  );

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ Updated client/js/billing.js successfully');
}

// 5. Update client/sw.js
{
  const filePath = path.join(projectRoot, 'client', 'sw.js');
  let content = fs.readFileSync(filePath, 'utf8');

  content = content.replace(
    /const CACHE_NAME = '.*?';/,
    "const CACHE_NAME = 'frose-street-v9-production-v50-clean-menu-modal-fix';"
  );

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ Updated client/sw.js successfully');
}
