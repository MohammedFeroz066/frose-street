/**
 * FROSE Street — WhatsApp Sharing & Customer Receipt Engine (Phase 19)
 * Generates pre-formatted WhatsApp deep-links for Daily Galla shifts and customer receipts.
 */
(function (global) {
  'use strict';

  class WhatsAppService {
    /**
     * Cleans Indian mobile number and adds 91 country code if necessary
     */
    static formatIndianPhone(phone) {
      if (!phone) return '';
      const digits = String(phone).replace(/\D/g, '');
      if (digits.length === 10) {
        return '91' + digits;
      }
      if (digits.length === 12 && digits.startsWith('91')) {
        return digits;
      }
      return digits;
    }

    /**
     * Generates a pre-formatted WhatsApp share link for the Daily Galla Summary
     * @param {Object} summary
     * @param {string} summary.stallName
     * @param {string} [summary.date]
     * @param {number} summary.totalSalesRupees
     * @param {number} summary.cashSalesRupees
     * @param {number} summary.upiSalesRupees
     * @param {number} summary.orderCount
     * @param {number} [summary.expensesRupees]
     * @returns {string} Pre-encoded WhatsApp deep link URL
     */
    static generateGallaShareUrl(summary) {
      const stallName = summary.stallName || 'FROSE Street Stall';
      const dateStr = summary.date || new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      const total = summary.totalSalesRupees || 0;
      const cash = summary.cashSalesRupees || 0;
      const upi = summary.upiSalesRupees || 0;
      const count = summary.orderCount || 0;
      const expenses = summary.expensesRupees || 0;

      let msg = `📊 *FROSE Street — Daily Shift Galla*\n`;
      msg += `📍 *Stall:* ${stallName}\n`;
      msg += `📅 *Date:* ${dateStr}\n`;
      msg += `--------------------------------\n`;
      msg += `💰 *Total Sales:* ₹${total.toLocaleString('en-IN')}\n`;
      msg += `💵 *Cash in Drawer:* ₹${cash.toLocaleString('en-IN')}\n`;
      msg += `📱 *UPI Collections:* ₹${upi.toLocaleString('en-IN')}\n`;
      if (expenses > 0) {
        msg += `🧾 *Shift Expenses:* ₹${expenses.toLocaleString('en-IN')}\n`;
      }
      msg += `🔢 *Total Orders:* ${count}\n`;
      msg += `--------------------------------\n`;
      msg += `⚡ Powered by FROSE Street Micro-POS\n`;
      msg += `street.frosetech.com`;

      return `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    }

    /**
     * Generates a pre-formatted customer digital receipt link
     * @param {Object} receipt
     * @param {string} [receipt.phone]
     * @param {string} receipt.stallName
     * @param {number|string} receipt.tokenNo
     * @param {Array<{name: string, quantity: number, priceRupees: number}>} receipt.items
     * @param {number} receipt.totalRupees
     * @param {string} [receipt.paymentMethod]
     * @param {string} [receipt.timestamp]
     * @returns {string} WhatsApp receipt link
     */
    static generateCustomerReceiptUrl(receipt) {
      const stall = receipt.stallName || 'FROSE Street Stall';
      const token = receipt.tokenNo || 1;
      const items = Array.isArray(receipt.items) ? receipt.items : [];
      const total = receipt.totalRupees || 0;
      const pm = (receipt.paymentMethod || 'CASH').toUpperCase();
      const timeStr = receipt.timestamp || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

      let msg = `🧾 *Receipt from ${stall}*\n`;
      msg += `🎫 *Order Token:* #${token}\n`;
      msg += `📅 *Date:* ${timeStr}\n`;
      msg += `--------------------------------\n`;

      for (const item of items) {
        const qty = item.quantity || 1;
        const name = item.name || 'Food Item';
        const price = item.priceRupees || 0;
        msg += `${qty}x ${name} — ₹${price * qty}\n`;
      }

      msg += `--------------------------------\n`;
      msg += `💰 *Total Paid:* ₹${total} (${pm})\n`;
      msg += `--------------------------------\n`;
      msg += `🙏 Thank you for dining with us! Visit again.`;

      const formattedPhone = this.formatIndianPhone(receipt.phone);
      if (formattedPhone) {
        return `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(msg)}`;
      }
      return `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    }

    /**
     * Helper to open WhatsApp share in a new browser tab/window
     */
    static openGallaShare(summary) {
      const url = this.generateGallaShareUrl(summary);
      if (typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      return url;
    }

    /**
     * Helper to open customer receipt in WhatsApp
     */
    static openCustomerReceipt(receipt) {
      const url = this.generateCustomerReceiptUrl(receipt);
      if (typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      return url;
    }
  }

  // Export module for Browser and Node/Vitest
  const WhatsAppModule = {
    WhatsAppService,
  };

  global.__FROSE_WHATSAPP__ = WhatsAppModule;
  if (typeof globalThis !== 'undefined') {
    globalThis.__FROSE_WHATSAPP__ = WhatsAppModule;
  }
  if (typeof window !== 'undefined') {
    window.__FROSE_WHATSAPP__ = WhatsAppModule;
  }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

export const WhatsAppService = globalThis.__FROSE_WHATSAPP__?.WhatsAppService;
export default globalThis.__FROSE_WHATSAPP__;
