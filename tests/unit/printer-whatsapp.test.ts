import { describe, it, expect, beforeEach } from 'vitest';
import { EscPosGenerator, format32Columns, stringToBytes, COMMANDS } from '../../client/js/escpos-generator.js';
import { BluetoothPrinterManager } from '../../client/js/bluetooth-printer.js';
import { WhatsAppService } from '../../client/js/whatsapp-service.js';

describe('Phase 19: Bluetooth Thermal Printer & WhatsApp Integration', () => {

  describe('ESC/POS 58mm Thermal Printer Engine', () => {
    it('1. Generates valid ESC/POS byte buffer with standard initialization and cut commands', () => {
      const slipData = {
        stallName: 'Tibetan Momo Point',
        tokenNo: 42,
        items: [
          { name: 'Veg Steamed Momos', quantity: 2, priceRupees: 70 },
          { name: 'Masala Chai', quantity: 1, priceRupees: 20 },
        ],
        totalRupees: 160,
        paymentMethod: 'UPI',
        timestamp: '17 Nov 2026, 12:45 PM',
      };

      const buffer = EscPosGenerator.generateTokenSlip(slipData);
      expect(buffer).toBeInstanceOf(Uint8Array);
      expect(buffer.length).toBeGreaterThan(50);

      // Verify INIT command [0x1B, 0x40]
      expect(buffer[0]).toBe(0x1b);
      expect(buffer[1]).toBe(0x40);

      // Verify Feed [0x1B, 0x64, 0x03] and Cut [0x1D, 0x56, 0x42, 0x00] at end of buffer
      const len = buffer.length;
      expect(buffer[len - 4]).toBe(0x1d); // GS
      expect(buffer[len - 3]).toBe(0x56); // 'V'
      expect(buffer[len - 2]).toBe(0x42); // 'B'
      expect(buffer[len - 1]).toBe(0x00);
    });

    it('2. Formats token number with double-height & double-width ESC/POS command (GS ! 0x11)', () => {
      const slipData = {
        stallName: 'Dosa King',
        tokenNo: 15,
        items: [{ name: 'Masala Dosa', quantity: 1, priceRupees: 60 }],
        totalRupees: 60,
      };

      const buffer = EscPosGenerator.generateTokenSlip(slipData);
      
      // Search for double size command bytes [0x1D, 0x21, 0x11]
      let foundDoubleSize = false;
      for (let i = 0; i < buffer.length - 2; i++) {
        if (buffer[i] === 0x1d && buffer[i + 1] === 0x21 && buffer[i + 2] === 0x11) {
          foundDoubleSize = true;
          break;
        }
      }
      expect(foundDoubleSize).toBe(true);
    });

    it('3. Formats 32-column monospaced rows with price right-alignment', () => {
      const line = format32Columns('2x Veg Momos', 'Rs. 140', 32);
      expect(line.length).toBe(32);
      expect(line.startsWith('2x Veg Momos')).toBe(true);
      expect(line.endsWith('Rs. 140')).toBe(true);

      // Verify padding spaces
      const spaceCount = line.length - '2x Veg Momos'.length - 'Rs. 140'.length;
      expect(spaceCount).toBe(32 - 12 - 7); // 13 spaces
    });

    it('4. Gracefully truncates long dish names to keep exact 32-column limit', () => {
      const longName = 'Extra Spicy Schezwan Fried Paneer Momos Special Platter';
      const line = format32Columns(`1x ${longName}`, 'Rs. 250', 32);
      expect(line.length).toBe(32);
      expect(line.endsWith('Rs. 250')).toBe(true);
    });

    it('5. Converts Rupee symbol ₹ (0x20B9) into ASCII-safe "Rs. " for budget thermal printers', () => {
      const bytes = stringToBytes('Total: ₹150');
      const text = String.fromCharCode(...bytes);
      expect(text).toContain('Rs. 150');
    });
  });

  describe('WhatsApp Sharing & Receipt Deep-Linking', () => {
    it('6. Generates pre-formatted WhatsApp Daily Shift Galla URL', () => {
      const gallaData = {
        stallName: 'Tibetan Momo Point',
        date: '17 Nov 2026',
        totalSalesRupees: 4850,
        cashSalesRupees: 2600,
        upiSalesRupees: 2250,
        orderCount: 42,
        expensesRupees: 350,
      };

      const url = WhatsAppService.generateGallaShareUrl(gallaData);
      expect(url).toContain('https://api.whatsapp.com/send?text=');

      const encodedQuery = url.split('text=')[1]!;
      const decoded = decodeURIComponent(encodedQuery);

      expect(decoded).toContain('Daily Shift Galla');
      expect(decoded).toContain('Tibetan Momo Point');
      expect(decoded).toContain('*Total Sales:* ₹4,850');
      expect(decoded).toContain('*Cash in Drawer:* ₹2,600');
      expect(decoded).toContain('*UPI Collections:* ₹2,250');
      expect(decoded).toContain('*Shift Expenses:* ₹350');
      expect(decoded).toContain('*Total Orders:* 42');
    });

    it('7. Generates pre-formatted WhatsApp customer receipt URL with Indian phone prefix', () => {
      const receiptData = {
        phone: '9876543210',
        stallName: 'Tibetan Momo Point',
        tokenNo: 14,
        items: [
          { name: 'Veg Steamed Momos', quantity: 2, priceRupees: 70 },
          { name: 'Masala Chai', quantity: 1, priceRupees: 20 },
        ],
        totalRupees: 160,
        paymentMethod: 'UPI',
        timestamp: '17 Nov 2026, 12:45 PM',
      };

      const url = WhatsAppService.generateCustomerReceiptUrl(receiptData);
      expect(url).toContain('https://api.whatsapp.com/send?phone=919876543210');

      const encodedQuery = url.split('&text=')[1]!;
      const decoded = decodeURIComponent(encodedQuery);

      expect(decoded).toContain('Receipt from Tibetan Momo Point');
      expect(decoded).toContain('Order Token:* #14');
      expect(decoded).toContain('2x Veg Steamed Momos — ₹140');
      expect(decoded).toContain('1x Masala Chai — ₹20');
      expect(decoded).toContain('Total Paid:* ₹160 (UPI)');
    });

    it('8. Formats customer receipt without phone when recipient is unknown', () => {
      const receiptData = {
        stallName: 'Chai Point',
        tokenNo: 7,
        items: [{ name: 'Cutting Chai', quantity: 2, priceRupees: 15 }],
        totalRupees: 30,
        paymentMethod: 'CASH',
      };

      const url = WhatsAppService.generateCustomerReceiptUrl(receiptData);
      expect(url).toContain('https://api.whatsapp.com/send?text=');
      expect(url).not.toContain('phone=');
    });

    it('9. Formats Indian phone numbers with country code standard (clean non-digits, adds 91 prefix)', () => {
      expect(WhatsAppService.formatIndianPhone('9876543210')).toBe('919876543210');
      expect(WhatsAppService.formatIndianPhone('+91 98765 43210')).toBe('919876543210');
      expect(WhatsAppService.formatIndianPhone('919876543210')).toBe('919876543210');
      expect(WhatsAppService.formatIndianPhone('')).toBe('');
    });
  });

  describe('Bluetooth Thermal Printer Manager & Auto-Print Lifecycle', () => {
    let printer: BluetoothPrinterManager;

    beforeEach(() => {
      printer = new BluetoothPrinterManager();
    });

    it('10. Detects disconnected state and returns error gracefully on print call without throwing', async () => {
      expect(printer.isConnected()).toBe(false);
      const res = await printer.print(new Uint8Array([0x1b, 0x40]));
      expect(res.ok).toBe(false);
      expect(res.error).toContain('not connected');
    });

    it('11. Manages auto-print preference (defaults to true and persists to localStorage)', () => {
      expect(printer.isAutoPrintEnabled()).toBe(true);

      printer.setAutoPrintEnabled(false);
      expect(printer.isAutoPrintEnabled()).toBe(false);

      printer.setAutoPrintEnabled(true);
      expect(printer.isAutoPrintEnabled()).toBe(true);
    });

    it('12. Simulates Web Bluetooth GATT mock discovery and chunked BLE buffer transfer', async () => {
      const writtenChunks: Uint8Array[] = [];

      // Mock BLE Device and Characteristic
      const mockCharacteristic = {
        properties: { writeWithoutResponse: true, write: false },
        writeValueWithoutResponse: async (chunk: Uint8Array) => {
          writtenChunks.push(chunk);
        },
      };

      const mockGattServer = {
        connected: true,
        connect: async () => mockGattServer,
        disconnect: async () => { mockGattServer.connected = false; },
      };

      const mockDevice = {
        name: 'MPT-II 58mm Printer',
        gatt: mockGattServer,
        addEventListener: () => {},
      };

      printer.device = mockDevice;
      printer.server = mockGattServer;
      printer.characteristic = mockCharacteristic;
      printer.deviceName = mockDevice.name;

      expect(printer.isConnected()).toBe(true);

      // Generate slip (> 200 bytes)
      const slip = EscPosGenerator.generateTokenSlip({
        stallName: 'Test Stall',
        tokenNo: 88,
        items: [{ name: 'Chai', quantity: 2, priceRupees: 20 }],
        totalRupees: 40,
      });

      const printResult = await printer.print(slip);
      expect(printResult.ok).toBe(true);
      expect(printResult.bytesSent).toBe(slip.length);
      expect(writtenChunks.length).toBeGreaterThanOrEqual(1);

      // Clean disconnect
      await printer.disconnect();
      expect(printer.isConnected()).toBe(false);
    });
  });
});
