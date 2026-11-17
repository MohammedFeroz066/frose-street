export interface PrintResult {
  ok: boolean;
  bytesSent?: number;
  error?: string;
}

export interface ConnectResult {
  ok: boolean;
  deviceName?: string;
  error?: string;
}

export declare class BluetoothPrinterManager {
  device: any;
  server: any;
  characteristic: any;
  status: 'disconnected' | 'connecting' | 'connected' | 'unsupported';
  deviceName: string;
  autoPrint: boolean;

  static isSupported(): boolean;
  onStatusChange(callback: (status: string, details: any) => void): void;
  notifyStatus(status: string, details?: any): void;
  connect(): Promise<ConnectResult>;
  disconnect(): Promise<{ ok: boolean }>;
  isConnected(): boolean;
  print(buffer: Uint8Array): Promise<PrintResult>;
  testPrint(stallName?: string): Promise<PrintResult>;
  loadAutoPrintPref(): boolean;
  setAutoPrintEnabled(enabled: boolean): void;
  isAutoPrintEnabled(): boolean;
}

export declare const printerInstance: BluetoothPrinterManager;
export declare const PRINTER_SERVICES: string[];

export default BluetoothPrinterManager;
