/**
 * FROSE Street — Web Bluetooth 58mm Thermal Printer Manager (Phase 19)
 * Handles GATT connection, characteristic discovery, chunked BLE writing, and lifecycle state.
 */
(function (global) {
  'use strict';

  // Standard BLE Thermal Printer Service & Characteristic UUIDs
  const PRINTER_SERVICES = [
    '000018f0-0000-1000-8000-00805f9b34fb', // Standard Thermal Printer Service
    '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Proprietary BLE Service
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Posiflex / Common Chinese Thermal
    '0000e0ff-0000-1000-8000-00805f9b34fb', // EscPos Mobile Printer Service
  ];

  class BluetoothPrinterManager {
    constructor() {
      this.device = null;
      this.server = null;
      this.characteristic = null;
      this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'unsupported'
      this.deviceName = '';
      this.statusListeners = [];
      this.autoPrint = this.loadAutoPrintPref();
    }

    /**
     * Checks if Web Bluetooth API is supported in current environment
     */
    static isSupported() {
      return typeof navigator !== 'undefined' && typeof navigator.bluetooth !== 'undefined';
    }

    /**
     * Subscribe to printer connection status changes
     */
    onStatusChange(callback) {
      if (typeof callback === 'function') {
        this.statusListeners.push(callback);
      }
    }

    notifyStatus(status, details = {}) {
      this.status = status;
      for (const listener of this.statusListeners) {
        try {
          listener(status, { deviceName: this.deviceName, ...details });
        } catch {}
      }
    }

    /**
     * Prompts browser Bluetooth device picker and connects to thermal printer
     */
    async connect() {
      if (!BluetoothPrinterManager.isSupported()) {
        this.notifyStatus('unsupported', { error: 'Web Bluetooth API is not supported in this browser' });
        return { ok: false, error: 'Web Bluetooth not supported' };
      }

      try {
        this.notifyStatus('connecting');

        // Request Bluetooth Device with printer filters or acceptAllDevices with optionalServices
        const device = await navigator.bluetooth.requestDevice({
          filters: [
            { services: [PRINTER_SERVICES[0]] },
            { namePrefix: 'MPT' },
            { namePrefix: 'POS' },
            { namePrefix: 'PT-' },
            { namePrefix: 'RPP' },
            { namePrefix: 'Bluetooth' },
            { namePrefix: 'Printer' },
          ],
          optionalServices: PRINTER_SERVICES,
        }).catch(async () => {
          // Fallback: Accept all devices if name filter misses
          return await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: PRINTER_SERVICES,
          });
        });

        if (!device) {
          this.notifyStatus('disconnected', { reason: 'No device selected' });
          return { ok: false, error: 'No device selected' };
        }

        this.device = device;
        this.deviceName = device.name || 'Bluetooth Thermal Printer';

        // Listen for disconnect
        device.addEventListener('gattserverdisconnected', () => {
          this.characteristic = null;
          this.server = null;
          this.notifyStatus('disconnected', { reason: 'Printer disconnected' });
        });

        // Connect GATT Server
        const server = await device.gatt.connect();
        this.server = server;

        // Discover Primary Service & Writable Characteristic
        let characteristic = null;
        for (const serviceUuid of PRINTER_SERVICES) {
          try {
            const service = await server.getPrimaryService(serviceUuid);
            const characteristics = await service.getCharacteristics();
            for (const char of characteristics) {
              if (char.properties.write || char.properties.writeWithoutResponse) {
                characteristic = char;
                break;
              }
            }
            if (characteristic) break;
          } catch {}
        }

        // If not found in known services, inspect all services
        if (!characteristic) {
          const services = await server.getPrimaryServices().catch(() => []);
          for (const service of services) {
            const chars = await service.getCharacteristics().catch(() => []);
            for (const char of chars) {
              if (char.properties.write || char.properties.writeWithoutResponse) {
                characteristic = char;
                break;
              }
            }
            if (characteristic) break;
          }
        }

        if (!characteristic) {
          await device.gatt.disconnect();
          this.notifyStatus('disconnected', { error: 'No writable print characteristic found' });
          return { ok: false, error: 'No writable printer characteristic found' };
        }

        this.characteristic = characteristic;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('frose_printer_name', this.deviceName);
        }

        this.notifyStatus('connected', { deviceName: this.deviceName });
        return { ok: true, deviceName: this.deviceName };
      } catch (err) {
        this.notifyStatus('disconnected', { error: err.message || 'Connection failed' });
        return { ok: false, error: err.message };
      }
    }

    /**
     * Disconnects active printer
     */
    async disconnect() {
      if (this.device && this.device.gatt && this.device.gatt.connected) {
        try {
          await this.device.gatt.disconnect();
        } catch {}
      }
      this.device = null;
      this.server = null;
      this.characteristic = null;
      this.notifyStatus('disconnected');
      return { ok: true };
    }

    /**
     * Checks if printer is currently connected
     */
    isConnected() {
      return (
        this.device !== null &&
        this.device.gatt !== null &&
        this.device.gatt.connected &&
        this.characteristic !== null
      );
    }

    /**
     * Sends ESC/POS byte buffer to thermal printer with BLE MTU chunking
     * @param {Uint8Array} buffer
     */
    async print(buffer) {
      if (!this.isConnected()) {
        return { ok: false, error: 'Printer is not connected' };
      }

      if (!(buffer instanceof Uint8Array)) {
        return { ok: false, error: 'Invalid buffer format. Expected Uint8Array' };
      }

      try {
        // BLE MTU chunk size (typically 128 to 512 bytes)
        const CHUNK_SIZE = 128;
        for (let i = 0; i < buffer.length; i += CHUNK_SIZE) {
          const chunk = buffer.slice(i, i + CHUNK_SIZE);
          if (this.characteristic.properties.writeWithoutResponse) {
            await this.characteristic.writeValueWithoutResponse(chunk);
          } else {
            await this.characteristic.writeValue(chunk);
          }
          // Small pacing delay to avoid buffer overrun on budget 58mm printer microcontrollers
          await new Promise((r) => setTimeout(r, 15));
        }

        return { ok: true, bytesSent: buffer.length };
      } catch (err) {
        return { ok: false, error: err.message || 'Print dispatch failed' };
      }
    }

    /**
     * Generates and prints a diagnostic 58mm test token slip
     */
    async testPrint(stallName = 'Tibetan Momo Point') {
      const EscPos = global.__FROSE_ESCPOS__?.EscPosGenerator;
      if (!EscPos) {
        return { ok: false, error: 'EscPosGenerator not loaded' };
      }

      const sampleSlip = EscPos.generateTokenSlip({
        stallName,
        tokenNo: 99,
        items: [
          { name: 'Veg Steamed Momos', quantity: 2, priceRupees: 70 },
          { name: 'Masala Chai', quantity: 1, priceRupees: 20 },
        ],
        totalRupees: 160,
        paymentMethod: 'UPI',
        timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      });

      return await this.print(sampleSlip);
    }

    /**
     * Auto-print setting management
     */
    loadAutoPrintPref() {
      if (typeof localStorage !== 'undefined') {
        const val = localStorage.getItem('frose_auto_print');
        return val !== 'false'; // Default: ON
      }
      return true;
    }

    setAutoPrintEnabled(enabled) {
      this.autoPrint = !!enabled;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('frose_auto_print', this.autoPrint ? 'true' : 'false');
      }
    }

    isAutoPrintEnabled() {
      return this.autoPrint;
    }
  }

  // Export module for Browser and Node/Vitest
  const printerInstance = new BluetoothPrinterManager();

  const BluetoothModule = {
    BluetoothPrinterManager,
    printerInstance,
    PRINTER_SERVICES,
  };

  global.__FROSE_PRINTER__ = BluetoothModule;
  if (typeof globalThis !== 'undefined') {
    globalThis.__FROSE_PRINTER__ = BluetoothModule;
  }
  if (typeof window !== 'undefined') {
    window.__FROSE_PRINTER__ = BluetoothModule;
  }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

export const BluetoothPrinterManager = globalThis.__FROSE_PRINTER__?.BluetoothPrinterManager;
export const printerInstance = globalThis.__FROSE_PRINTER__?.printerInstance;
export const PRINTER_SERVICES = globalThis.__FROSE_PRINTER__?.PRINTER_SERVICES;
export default globalThis.__FROSE_PRINTER__;
