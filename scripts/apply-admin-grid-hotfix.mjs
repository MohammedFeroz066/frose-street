import fs from 'node:fs';
import path from 'node:path';

const adminHtmlPath = path.resolve('client/admin.html');
let html = fs.readFileSync(adminHtmlPath, 'utf8');

// 1. Remove .brand-receipt-badge::after and replace with .brand-trademark
const oldBadgeCss = `.brand-receipt-badge::after {
      content: 'TM';
      position: absolute;
      top: -3px;
      right: -13px;
      font-size: 8px;
      font-weight: 800;
      color: rgba(255, 255, 255, 0.9);
    }`;

const newTrademarkCss = `.brand-trademark {
      font-size: 8px;
      font-weight: 800;
      color: rgba(255, 255, 255, 0.85);
      vertical-align: super;
      margin-left: 2px;
      line-height: 1;
      display: inline-block;
    }`;

if (html.includes("content: 'TM';")) {
  html = html.replace(/\.brand-receipt-badge::after\s*\{[^}]+\}/, newTrademarkCss);
}

// 2. Add brand-trademark in header HTML
if (!html.includes('<span class="brand-trademark">TM</span>')) {
  html = html.replace(
    '<span class="brand-word-street">STREET</span>',
    '<span class="brand-word-street">STREET</span><span class="brand-trademark">TM</span>'
  );
}

// 3. Grid for .nav-bar-inner and responsive nav-tab-pill
const newNavGridCss = `.nav-bar-inner {
      max-width: 1200px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      align-items: center;
    }`;

html = html.replace(/\.nav-bar-inner\s*\{[^}]+scrollbar-width:\s*none;\s*\}/, newNavGridCss);

const newTabPillCss = `.nav-tab-pill {
      min-width: 0;
      width: 100%;
      padding: 7px 4px;
      border-radius: 12px;
      border: none;
      background: transparent;
      color: var(--saas-text-muted);
      font-size: 12px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
      user-select: none;
      -webkit-user-select: none;
    }`;

html = html.replace(/\.nav-tab-pill\s*\{[^}]+white-space:\s*nowrap;\s*\}/, newTabPillCss);

// 4. Change Tab 2 label from 'Vendors & Billing' to 'Vendors'
html = html.replace(
  '<span>Vendors & Billing</span>',
  '<span>Vendors</span>'
);

// 5. Grid for .bottom-bar-inner
const newBottomGridCss = `.bottom-bar-inner {
      max-width: 480px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: 1fr 1fr 1.35fr 1fr 1fr;
      align-items: center;
      height: 100%;
      gap: 2px;
    }`;

html = html.replace(/\.bottom-bar-inner\s*\{[^}]+gap:\s*2px;\s*\}/, newBottomGridCss);

fs.writeFileSync(adminHtmlPath, html, 'utf8');
console.log('Successfully updated client/admin.html');
