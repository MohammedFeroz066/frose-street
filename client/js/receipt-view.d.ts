export interface ReceiptOrderInput {
  id?: string;
  receiptNumber?: string | null;
  tokenNo?: number | null;
  tokenDisplay?: string;
  localTokenDisplay?: string | null;
  taxModeSnapshot?: 'unregistered' | 'composition' | 'regular';
  subtotalPaise?: number;
  cgstPaise?: number;
  sgstPaise?: number;
  totalPaise: number;
  paymentMethod?: string;
  orderStatus?: string;
  cancelReason?: string | null;
  createdAt?: string;
  items?: Array<{
    name?: string;
    itemName?: string;
    quantity: number;
    unitPricePaise?: number;
    pricePaise?: number;
    lineTotalPaise?: number;
  }>;
}

export interface ReceiptVendorProfile {
  businessName?: string;
  stallAddress?: string | null;
  gstin?: string | null;
  fssaiNumber?: string | null;
  taxMode?: 'unregistered' | 'composition' | 'regular';
}

export interface ThermalReceiptImageResult {
  blob: Blob;
  file: File | null;
  fileName: string;
  width: number;
  height: number;
  paperWidth: '58' | '80';
  receiptData: any;
}

declare const FroseReceiptView: {
  COMPOSITION_DECLARATION: string;
  formatPaiseToRupees(paise: number | bigint): string;
  formatIstTimestamp(dateInput?: Date | string): string;
  getStatutoryHeader(taxMode: string): 'CASH MEMO' | 'BILL OF SUPPLY' | 'TAX INVOICE';
  formatPaymentLabel(paymentMethod?: string): string;
  normalizeReceiptData(order: ReceiptOrderInput, vendorProfile?: ReceiptVendorProfile): any;
  buildPlainTextReceipt(order: ReceiptOrderInput, vendorProfile?: ReceiptVendorProfile): string;
  renderReceiptDom(containerEl: HTMLElement, order: ReceiptOrderInput, vendorProfile?: ReceiptVendorProfile, safeDom?: any): any;
  normalizeWhatsAppPhone(raw: string): { valid: boolean; local10: string; e164Digits: string };
  buildWhatsAppCaption(order: ReceiptOrderInput, vendorProfile?: ReceiptVendorProfile): string;
  buildWhatsAppUrl(phoneInput: string, captionText: string): string;
  getThermalCanvasMetrics(paperWidth?: string | number): {
    paperWidth: '58' | '80';
    logicalWidth: number;
    scale: number;
    paddingX: number;
    paddingY: number;
    headerFontSize: number;
    titleFontSize: number;
    baseFontSize: number;
    smallFontSize: number;
    totalFontSize: number;
    lineHeight: number;
    smallLineHeight: number;
  };
  renderReceiptToCanvas(order: ReceiptOrderInput, vendorProfile?: ReceiptVendorProfile, options?: { paperWidth?: '58' | '80' | string; canvas?: HTMLCanvasElement }): any;
  buildThermalReceiptImage(order: ReceiptOrderInput, vendorProfile?: ReceiptVendorProfile, options?: { paperWidth?: '58' | '80' | string; canvas?: HTMLCanvasElement }): Promise<ThermalReceiptImageResult>;
};

export default FroseReceiptView;
