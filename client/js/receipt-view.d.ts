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

declare const FroseReceiptView: {
  COMPOSITION_DECLARATION: string;
  formatPaiseToRupees(paise: number | bigint): string;
  formatIstTimestamp(dateInput?: Date | string): string;
  getStatutoryHeader(taxMode: string): 'CASH MEMO' | 'BILL OF SUPPLY' | 'TAX INVOICE';
  formatPaymentLabel(paymentMethod?: string): string;
  normalizeReceiptData(order: ReceiptOrderInput, vendorProfile?: ReceiptVendorProfile): any;
  buildPlainTextReceipt(order: ReceiptOrderInput, vendorProfile?: ReceiptVendorProfile): string;
  renderReceiptDom(containerEl: HTMLElement, order: ReceiptOrderInput, vendorProfile?: ReceiptVendorProfile, safeDom?: any): any;
};

export default FroseReceiptView;
