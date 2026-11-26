import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('IND-03: Honest UPI Wording & Compliant 58mm/80mm Statutory Receipt View', () => {
  const clientDir = path.resolve(__dirname, '../../client');

  it('audits all client HTML/JS files for misleading payment copy (zero fake auto-verified UPI claims)', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(html|js)$/i.test(entry.name)) files.push(full);
      }
    };
    walk(clientDir);

    const forbidden: string[] = [];
    const badPattern = /(Auto-?Verified\s+UPI|Payment\s+Verified\s+Automatically|Received\s+on\s+FROSE\s+Pay|Payment:\s*\$\{pm\}\s*\(Settled\))/i;
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      if (badPattern.test(src)) {
        forbidden.push(path.relative(clientDir, file));
      }
    }
    expect(forbidden).toEqual([]);

    const billingHtml = fs.readFileSync(path.join(clientDir, 'billing.html'), 'utf8');
    expect(billingHtml).toContain('Confirm on Soundbox/App');
  });

  it('receipt-view.js renders statutory headers, Composition declaration, FSSAI, GSTIN, and CGST/SGST cleanly', async () => {
    const mod = await import('../../client/js/receipt-view.js');
    const receiptView = mod.default || (globalThis as any).FroseReceiptView;
    expect(receiptView).toBeDefined();
    expect(typeof receiptView.getStatutoryHeader).toBe('function');
    expect(typeof receiptView.buildPlainTextReceipt).toBe('function');
    expect(typeof receiptView.renderReceiptDom).toBe('function');

    // 1. Statutory headers
    expect(receiptView.getStatutoryHeader('unregistered')).toBe('CASH MEMO');
    expect(receiptView.getStatutoryHeader('composition')).toBe('BILL OF SUPPLY');
    expect(receiptView.getStatutoryHeader('regular')).toBe('TAX INVOICE');

    // 2. Composition Scheme mandatory declaration & FSSAI & GSTIN
    const compText = receiptView.buildPlainTextReceipt(
      {
        receiptNumber: 'FS-2627-0001',
        tokenNo: 1,
        taxModeSnapshot: 'composition',
        subtotalPaise: 8000,
        cgstPaise: 0,
        sgstPaise: 0,
        totalPaise: 8000,
        paymentMethod: 'upi',
        createdAt: '2026-11-26T10:30:00.000Z',
        items: [{ name: 'Veg Steamed Momos', quantity: 1, unitPricePaise: 8000, lineTotalPaise: 8000 }],
      },
      {
        businessName: 'Chai & Momos Point',
        stallAddress: 'Stall 4, Food Court, Hyderabad',
        gstin: '36AABCU9603R1ZM',
        fssaiNumber: '23626001000123',
        taxMode: 'composition',
      },
    );

    expect(compText).toContain('BILL OF SUPPLY');
    expect(compText).toContain('Composition taxable person, not eligible to collect tax on supplies.');
    expect(compText).toContain('FSSAI Lic./Reg. No: 23626001000123');
    expect(compText).toContain('GSTIN: 36AABCU9603R1ZM');
    expect(compText).toContain('FS-2627-0001');
    expect(compText).toContain('Marked paid (UPI)');

    // 3. Regular GST invoice shows CGST and SGST lines
    const regText = receiptView.buildPlainTextReceipt(
      {
        receiptNumber: 'FS-2627-0002',
        tokenNo: 2,
        taxModeSnapshot: 'regular',
        subtotalPaise: 10000,
        cgstPaise: 250,
        sgstPaise: 250,
        totalPaise: 10500,
        paymentMethod: 'cash',
        createdAt: '2026-11-26T10:35:00.000Z',
        items: [{ name: 'Chicken Biryani', quantity: 1, unitPricePaise: 10000, lineTotalPaise: 10000 }],
      },
      {
        businessName: 'Royal Biryani Counter',
        gstin: '36AABCU9603R1ZM',
        fssaiNumber: '23626001000123',
        taxMode: 'regular',
      },
    );

    expect(regText).toContain('TAX INVOICE');
    expect(regText).toContain('CGST');
    expect(regText).toContain('SGST');
    expect(regText).toContain('₹105.00');
    expect(regText).not.toContain('Composition taxable person');

    // 4. Unregistered CASH MEMO
    const unregText = receiptView.buildPlainTextReceipt(
      {
        receiptNumber: 'FS-2627-0003',
        tokenNo: 3,
        taxModeSnapshot: 'unregistered',
        subtotalPaise: 1500,
        cgstPaise: 0,
        sgstPaise: 0,
        totalPaise: 1500,
        paymentMethod: 'cash',
        createdAt: '2026-11-26T10:40:00.000Z',
        items: [{ name: 'Masala Chai', quantity: 1, unitPricePaise: 1500, lineTotalPaise: 1500 }],
      },
      {
        businessName: 'Street Chai Point',
        taxMode: 'unregistered',
      },
    );
    expect(unregText).toContain('CASH MEMO');
    expect(unregText).toContain('₹15.00');
  });

  it('billing.html contains thermal @media print styles and receipt modal with Print & Copy Bill Text buttons', () => {
    const billingHtml = fs.readFileSync(path.join(clientDir, 'billing.html'), 'utf8');
    expect(billingHtml).toContain('@media print');
    expect(billingHtml).toContain('id="receipt-modal"');
    expect(billingHtml).toContain('id="receipt-print-area"');
    expect(billingHtml).toContain('id="btn-print-receipt"');
    expect(billingHtml).toContain('id="btn-copy-bill-text"');
  });
});
