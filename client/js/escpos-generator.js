/**
 * FROSE Street — ESC/POS 58mm Thermal Printer Binary Command Engine (Phase 19)
 * Generates raw byte buffers for 58mm (32 columns per line) thermal receipt printers.
 */
(function (global) {
  'use strict';

  // Standard ESC/POS Control Byte Constants
  const ESC = 0x1b;
  const GS = 0x1d;

  const COMMANDS = {
    INIT: [ESC, 0x40], // ESC @ (Initialize printer hardware)
    ALIGN_LEFT: [ESC, 0x61, 0x00],
    ALIGN_CENTER: [ESC, 0x61, 0x01],
    ALIGN_RIGHT: [ESC, 0x61, 0x02],
    BOLD_ON: [ESC, 0x45, 0x01],
    BOLD_OFF: [ESC, 0x45, 0x00],
    DOUBLE_SIZE: [GS, 0x21, 0x11], // 2x width & 2x height for Token Number
    NORMAL_SIZE: [GS, 0x21, 0x00],
    FEED_3_LINES: [ESC, 0x64, 0x03],
    FEED_5_LINES: [ESC, 0x64, 0x05],
    PARTIAL_CUT: [GS, 0x56, 0x42, 0x00], // GS V 'B' 0
  };

  /**
   * Encodes standard ASCII/UTF-8 string into byte array
   */
  function stringToBytes(str) {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code === 0x20b9) {
        // Indian Rupee Symbol ₹ -> "Rs. "
        bytes.push(0x52, 0x73, 0x2e, 0x20);
      } else if (code < 128) {
        bytes.push(code);
      } else {
        bytes.push(0x3f); // '?' for unprintable glyphs
      }
    }
    return bytes;
  }

  /**
   * Formats a 32-column line with left-aligned text and right-aligned text
   * e.g. "2x Veg Momos               Rs. 140"
   */
  function format32Columns(leftStr, rightStr, totalCols = 32) {
    const left = String(leftStr || '');
    const right = String(rightStr || '');
    const maxLeftLen = totalCols - right.length - 1;

    let truncatedLeft = left;
    if (left.length > maxLeftLen && maxLeftLen > 0) {
      truncatedLeft = left.substring(0, maxLeftLen);
    }

    const spacesCount = Math.max(1, totalCols - truncatedLeft.length - right.length);
    return truncatedLeft + ' '.repeat(spacesCount) + right;
  }

  class EscPosGenerator {
    /**
     * Generates a complete 58mm thermal slip byte buffer for an order token
     * @param {Object} slipData
     * @param {string} slipData.stallName
     * @param {number|string} slipData.tokenNo
     * @param {Array<{name: string, quantity: number, priceRupees: number}>} slipData.items
     * @param {number} slipData.totalRupees
     * @param {string} [slipData.paymentMethod]
     * @param {string} [slipData.timestamp]
     * @returns {Uint8Array}
     */
    static generateTokenSlip(slipData) {
      const buffer = [];

      const append = (bytes) => {
        for (let i = 0; i < bytes.length; i++) {
          buffer.push(bytes[i]);
        }
      };

      const appendText = (text) => {
        append(stringToBytes(text));
      };

      const appendLine = (text = '') => {
        append(stringToBytes(text + '\n'));
      };

      // 1. Initialize Printer
      append(COMMANDS.INIT);

      // 2. Header: Stall Name (Centered & Bold)
      append(COMMANDS.ALIGN_CENTER);
      append(COMMANDS.BOLD_ON);
      appendLine(slipData.stallName || 'FROSE Street Food');
      append(COMMANDS.BOLD_OFF);
      appendLine('Formal Street Micro-POS');
      appendLine('--------------------------------');

      // 3. Giant Token Number (Centered, 2x Width & 2x Height)
      appendLine('ORDER TOKEN');
      append(COMMANDS.DOUBLE_SIZE);
      append(COMMANDS.BOLD_ON);
      appendLine(`#${slipData.tokenNo || 1}`);
      append(COMMANDS.NORMAL_SIZE);
      append(COMMANDS.BOLD_OFF);
      appendLine('--------------------------------');

      // 4. Itemized Table (32 Columns)
      append(COMMANDS.ALIGN_LEFT);
      const items = Array.isArray(slipData.items) ? slipData.items : [];
      for (const item of items) {
        const qty = item.quantity || 1;
        const name = item.name || 'Food Item';
        const price = item.priceRupees !== undefined ? item.priceRupees : 0;
        const leftCol = `${qty}x ${name}`;
        const rightCol = `Rs. ${price * qty}`;
        appendLine(format32Columns(leftCol, rightCol, 32));
      }
      appendLine('--------------------------------');

      // 5. Total Amount (Bold & Right-Aligned / Split Row)
      append(COMMANDS.BOLD_ON);
      const totalRow = format32Columns('TOTAL PAID', `Rs. ${slipData.totalRupees || 0}`, 32);
      appendLine(totalRow);
      append(COMMANDS.BOLD_OFF);
      appendLine('--------------------------------');

      // 6. Meta: Payment Method & Timestamp
      append(COMMANDS.ALIGN_CENTER);
      const pm = (slipData.paymentMethod || 'CASH').toUpperCase();
      const pmLabel = pm === 'UPI' ? 'Marked paid (UPI)' : 'Paid (' + pm + ')';
      appendLine('Payment: ' + pmLabel);
      const timeStr = slipData.timestamp || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      appendLine(timeStr);
      appendLine('*** Thank You! Visit Again ***');

      // 7. Feed 3 Lines & Tear-Off Cut
      append(COMMANDS.FEED_3_LINES);
      append(COMMANDS.PARTIAL_CUT);

      return new Uint8Array(buffer);
    }

    /**
     * Helper to format two columns
     */
    static format32Columns(left, right, totalCols = 32) {
      return format32Columns(left, right, totalCols);
    }

    /**
     * Returns ESC/POS Command Table
     */
    static getCommands() {
      return COMMANDS;
    }
  }

  // Export module for Browser and Node/Vitest
  const EscPosModule = {
    EscPosGenerator,
    COMMANDS,
    format32Columns,
    stringToBytes,
  };

  global.__FROSE_ESCPOS__ = EscPosModule;
  if (typeof globalThis !== 'undefined') {
    globalThis.__FROSE_ESCPOS__ = EscPosModule;
  }
  if (typeof window !== 'undefined') {
    window.__FROSE_ESCPOS__ = EscPosModule;
  }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

export const EscPosGenerator = globalThis.__FROSE_ESCPOS__?.EscPosGenerator;
export const COMMANDS = globalThis.__FROSE_ESCPOS__?.COMMANDS;
export const format32Columns = globalThis.__FROSE_ESCPOS__?.format32Columns;
export const stringToBytes = globalThis.__FROSE_ESCPOS__?.stringToBytes;
export default globalThis.__FROSE_ESCPOS__;
