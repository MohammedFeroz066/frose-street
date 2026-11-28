import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('WhatsApp Thermal Receipt Image & Direct Chat Flow', () => {
  const clientDir = path.resolve(__dirname, '../../client');

  it('normalizes 10-digit and 91-prefixed phone numbers and rejects invalid inputs', async () => {
    const mod = await import('../../client/js/receipt-view.js');
    const receiptView = mod.default || (globalThis as any).FroseReceiptView;

    expect(typeof receiptView.normalizeWhatsAppPhone).toBe('function');

    expect(receiptView.normalizeWhatsAppPhone('9876543210')).toEqual({
      valid: true,
      local10: '9876543210',
      e164Digits: '919876543210',
    });

    expect(receiptView.normalizeWhatsAppPhone('919876543210')).toEqual({
      valid: true,
      local10: '9876543210',
      e164Digits: '919876543210',
    });

    expect(receiptView.normalizeWhatsAppPhone('+91 98765-43210')).toEqual({
      valid: true,
      local10: '9876543210',
      e164Digits: '919876543210',
    });

    expect(receiptView.normalizeWhatsAppPhone('')).toMatchObject({ valid: false });
    expect(receiptView.normalizeWhatsAppPhone('98765')).toMatchObject({ valid: false });
    expect(receiptView.normalizeWhatsAppPhone('12345678901')).toMatchObject({ valid: false });
    expect(receiptView.normalizeWhatsAppPhone('929876543210')).toMatchObject({ valid: false });
    expect(receiptView.normalizeWhatsAppPhone('abcdefghij')).toMatchObject({ valid: false });
  });

  it('builds concise WhatsApp caption and wa.me/91... URL', async () => {
    const mod = await import('../../client/js/receipt-view.js');
    const receiptView = mod.default || (globalThis as any).FroseReceiptView;

    expect(typeof receiptView.buildWhatsAppCaption).toBe('function');
    expect(typeof receiptView.buildWhatsAppUrl).toBe('function');

    const order = {
      receiptNumber: 'FS-2627-0006',
      tokenNo: 5,
      totalPaise: 10000,
      paymentMethod: 'upi',
      items: [{ name: 'Masala dosa', quantity: 2, unitPricePaise: 5000, lineTotalPaise: 10000 }],
    };
    const vendor = { businessName: 'Amer momos', taxMode: 'unregistered' as const };

    const caption = receiptView.buildWhatsAppCaption(order, vendor);
    expect(caption).toBe('Amer momos — Receipt FS-2627-0006 (Token #5) — Total ₹100.00');

    const url = receiptView.buildWhatsAppUrl('9876543210', caption);
    expect(url).toBe(
      'https://wa.me/919876543210?text=' + encodeURIComponent(caption),
    );
  });

  it('renders 58mm and 80mm thermal receipts onto a 2x high-DPI canvas and builds a PNG Blob/File', async () => {
    const mod = await import('../../client/js/receipt-view.js');
    const receiptView = mod.default || (globalThis as any).FroseReceiptView;

    expect(typeof receiptView.getThermalCanvasMetrics).toBe('function');
    expect(typeof receiptView.renderReceiptToCanvas).toBe('function');
    expect(typeof receiptView.buildThermalReceiptImage).toBe('function');

    const m58 = receiptView.getThermalCanvasMetrics('58');
    const m80 = receiptView.getThermalCanvasMetrics('80');
    expect(m58.paperWidth).toBe('58');
    expect(m80.paperWidth).toBe('80');
    expect(m58.scale).toBe(2);
    expect(m80.scale).toBe(2);
    expect(m80.logicalWidth).toBeGreaterThan(m58.logicalWidth);

    const drawnTexts: string[] = [];
    const createMockCanvas = () => {
      const ctx = {
        scale: () => {},
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        font: '',
        textAlign: 'left',
        textBaseline: 'top',
        fillRect: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        setLineDash: () => {},
        measureText: (txt: string) => ({ width: String(txt).length * 7 }),
        fillText: (txt: string) => { drawnTexts.push(String(txt)); },
      };
      const canvas: any = {
        width: 0,
        height: 0,
        getContext: (type: string) => (type === '2d' ? ctx : null),
        toBlob: (cb: (b: Blob | null) => void, mime?: string) => {
          cb(new Blob(['png-bytes'], { type: mime || 'image/png' }));
        },
      };
      return canvas;
    };

    const order = {
      receiptNumber: 'FS-2627-0006',
      tokenNo: 5,
      taxModeSnapshot: 'regular' as const,
      subtotalPaise: 10000,
      cgstPaise: 250,
      sgstPaise: 250,
      totalPaise: 10500,
      paymentMethod: 'upi',
      createdAt: '2026-11-28T08:36:00.000Z',
      items: [{ name: 'Masala dosa', quantity: 2, unitPricePaise: 5000, lineTotalPaise: 10000 }],
    };
    const vendor = {
      businessName: 'Amer momos',
      gstin: '36AABCU9603R1ZM',
      fssaiNumber: '23626001000123',
      taxMode: 'regular' as const,
    };

    const res58 = await receiptView.buildThermalReceiptImage(order, vendor, {
      paperWidth: '58',
      canvas: createMockCanvas(),
    });
    expect(res58.paperWidth).toBe('58');
    expect(res58.width).toBe(m58.logicalWidth * 2);
    expect(res58.height).toBeGreaterThan(200);
    expect(res58.fileName).toBe('receipt-FS-2627-0006.png');
    expect(res58.blob).toBeInstanceOf(Blob);
    expect(res58.blob.type).toBe('image/png');

    const res80 = await receiptView.buildThermalReceiptImage(order, vendor, {
      paperWidth: '80',
      canvas: createMockCanvas(),
    });
    expect(res80.paperWidth).toBe('80');
    expect(res80.width).toBe(m80.logicalWidth * 2);

    const joined = drawnTexts.join(' | ');
    expect(joined).toContain('TAX INVOICE');
    expect(joined).toContain('Amer momos');
    expect(joined).toContain('FS-2627-0006');
    expect(joined).toContain('Token #5');
    expect(joined).toContain('Masala dosa');
    expect(joined).toContain('₹105.00');
    expect(joined).toContain('Marked paid (UPI)');
  });

  it('billing.html replaces Copy Bill Text (WhatsApp) with Send Bill WhatsApp and includes the phone sheet', () => {
    const billingHtml = fs.readFileSync(path.join(clientDir, 'billing.html'), 'utf8');
    expect(billingHtml).not.toContain('Copy Bill Text (WhatsApp)');
    expect(billingHtml).toContain('id="btn-send-whatsapp"');
    expect(billingHtml).toContain('Send Bill WhatsApp');
    expect(billingHtml).toContain('id="whatsapp-phone-sheet"');
    expect(billingHtml).toContain('id="wa-phone-input"');
    expect(billingHtml).toContain('inputmode="tel"');
    expect(billingHtml).toContain('maxlength="10"');
    expect(billingHtml).toContain('+91');
  });

  it('i18n.js provides en, te, hi, ta keys for Send Bill WhatsApp flow', async () => {
    const mod = await import('../../client/js/i18n.js');
    const i18n = (mod as any).default || (globalThis as any).FroseI18n;
    const requiredKeys = [
      'receipt.send_whatsapp',
      'receipt.copy_text',
      'receipt.wa_phone_title',
      'receipt.wa_phone_hint',
      'receipt.wa_phone_invalid',
      'receipt.wa_image_ready',
    ];
    for (const lang of ['en', 'te', 'hi', 'ta']) {
      for (const key of requiredKeys) {
        expect(typeof i18n.LOCALES[lang][key]).toBe('string');
        expect(i18n.LOCALES[lang][key].length).toBeGreaterThan(0);
      }
    }
  });
});
