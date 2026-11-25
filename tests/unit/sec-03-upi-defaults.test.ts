import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('SEC-14 / Step 1A.3: Remove Hardcoded Phone and UPI Defaults from Client Code', () => {
  const billingHtmlPath = path.resolve(__dirname, '../../client/billing.html');
  const indexHtmlPath = path.resolve(__dirname, '../../client/index.html');
  const settingsJsPath = path.resolve(__dirname, '../../client/js/settings-component.js');
  const billingJsPath = path.resolve(__dirname, '../../client/js/billing.js');

  it('billing.html must NOT contain hardcoded phone 9642230688 or VPA 9642230688@ybl', () => {
    const content = fs.readFileSync(billingHtmlPath, 'utf8');
    expect(content).not.toContain('9642230688');
    expect(content).not.toContain('9642230688@ybl');
  });

  it('index.html must NOT contain hardcoded phone 9642230688 or VPA 9642230688@ybl', () => {
    const content = fs.readFileSync(indexHtmlPath, 'utf8');
    expect(content).not.toContain('9642230688');
    expect(content).not.toContain('9642230688@ybl');
  });

  it('settings-component.js must NOT contain hardcoded phone 9642230688 or fallback VPA 9642230688@ybl', () => {
    const content = fs.readFileSync(settingsJsPath, 'utf8');
    expect(content).not.toContain('9642230688');
    expect(content).not.toContain('9642230688@ybl');
  });

  it('billing.js must NOT fall back to 9642230688@ybl and must handle unconfigured UPI gracefully', () => {
    const content = fs.readFileSync(billingJsPath, 'utf8');
    expect(content).not.toContain('9642230688');
    expect(content).not.toContain('9642230688@ybl');
  });

  it('settings-component.js displays "Set up payment QR" when no UPI is configured', () => {
    const content = fs.readFileSync(settingsJsPath, 'utf8');
    expect(content).toContain('Set up payment QR');
  });
});
