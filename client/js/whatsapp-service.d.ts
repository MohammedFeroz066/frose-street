export interface GallaShareInput {
  stallName: string;
  date?: string;
  totalSalesRupees: number;
  cashSalesRupees: number;
  upiSalesRupees: number;
  orderCount: number;
  expensesRupees?: number;
}

export interface CustomerReceiptInput {
  phone?: string;
  stallName: string;
  tokenNo: number | string;
  items: Array<{
    name: string;
    quantity: number;
    priceRupees: number;
  }>;
  totalRupees: number;
  paymentMethod?: string;
  timestamp?: string;
}

export declare class WhatsAppService {
  static formatIndianPhone(phone?: string): string;
  static generateGallaShareUrl(summary: GallaShareInput): string;
  static generateCustomerReceiptUrl(receipt: CustomerReceiptInput): string;
  static openGallaShare(summary: GallaShareInput): string;
  static openCustomerReceipt(receipt: CustomerReceiptInput): string;
}

export default WhatsAppService;
