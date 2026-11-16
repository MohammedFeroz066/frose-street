import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { AppError } from '../../errors/app-error.js';

// In-memory vendor VPA store (keyed by vendorId)
const vendorVpaStore = new Map<string, string>();

export interface UpiPayloadOptions {
  vpa: string;
  payeeName: string;
  amountPaise: bigint | number;
  tokenNo: number;
  itemsSummary?: string;
  transactionRef?: string;
}

export interface UpiPayloadResult {
  upiUri: string;
  qrDataUrl: string;
  vpa: string;
  payeeName: string;
  amountRupees: string;
  amountPaise: number;
  transactionNote: string;
  transactionRef: string;
}

export class PaymentService {
  /**
   * UPI VPA Validation Regex: username@bank
   * Alphanumeric, dots, hyphens, underscores followed by @ and bank handle
   */
  static readonly VPA_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

  /**
   * Validates UPI VPA format
   */
  static validateVpa(vpa: string): boolean {
    if (!vpa || typeof vpa !== 'string') return false;
    return this.VPA_REGEX.test(vpa.trim());
  }

  /**
   * Stores / updates vendor's UPI VPA
   */
  static setVendorVpa(vendorId: string, vpa: string): string {
    const trimmed = (vpa || '').trim();
    if (!this.validateVpa(trimmed)) {
      throw AppError.badRequest(
        'Invalid UPI ID format. Must be in username@bank format (e.g. name@okaxis, shop@oksbi)',
        'INVALID_UPI_VPA',
      );
    }
    vendorVpaStore.set(vendorId, trimmed);
    return trimmed;
  }

  /**
   * Retrieves vendor's configured UPI VPA or fallback
   */
  static getVendorVpa(vendorId: string, defaultFallback: string = 'frose.street@okaxis'): string {
    return vendorVpaStore.get(vendorId) || defaultFallback;
  }

  /**
   * Generates NPCI-compliant UPI 2.0 Deep Link URI and Camera-Scannable QR Code
   */
  static async generateUpiPayload(options: UpiPayloadOptions): Promise<UpiPayloadResult> {
    const { vpa, payeeName, amountPaise, tokenNo, itemsSummary, transactionRef } = options;

    if (!this.validateVpa(vpa)) {
      throw AppError.badRequest(
        'Invalid UPI ID format. Must be in username@bank format (e.g. name@okaxis)',
        'INVALID_UPI_VPA',
      );
    }

    const paiseBig = BigInt(amountPaise);
    if (paiseBig <= 0n) {
      throw AppError.badRequest('Amount must be greater than zero', 'INVALID_AMOUNT');
    }

    // Exact rupee string formatted to 2 decimals using integer paise
    const whole = (paiseBig / 100n).toString();
    const frac = (paiseBig % 100n).toString().padStart(2, '0');
    const amountRupees = `${whole}.${frac}`;

    // Transaction Note: Token # + Items
    const summary = itemsSummary ? `: ${itemsSummary}` : '';
    const transactionNote = `FROSE Token #${tokenNo}${summary}`.slice(0, 50); // Max 50 chars for UPI spec

    const txRef = transactionRef || `FROSE_${Date.now()}_${tokenNo}`;

    // Construct NPCI UPI Deep Link
    const upiUri = `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(payeeName)}&am=${amountRupees}&cu=INR&tn=${encodeURIComponent(transactionNote)}&tr=${encodeURIComponent(txRef)}`;

    // Generate high-contrast, camera-scannable QR Data URL
    const qrDataUrl = await QRCode.toDataURL(upiUri, {
      width: 320,
      margin: 2,
      color: {
        dark: '#0F172A',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    });

    return {
      upiUri,
      qrDataUrl,
      vpa,
      payeeName,
      amountRupees,
      amountPaise: Number(paiseBig),
      transactionNote,
      transactionRef: txRef,
    };
  }

  /**
   * Verifies Razorpay Webhook signature (HMAC SHA256)
   */
  static verifyRazorpayWebhook(payloadString: string, signature: string, secret: string): boolean {
    if (!signature || !secret) return false;
    const expected = crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }

  /**
   * Verifies Cashfree Webhook signature
   */
  static verifyCashfreeWebhook(payloadString: string, signature: string, secret: string): boolean {
    if (!signature || !secret) return false;
    const expected = crypto.createHmac('sha256', secret).update(payloadString).digest('base64');
    return expected === signature;
  }
}
