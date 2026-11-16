export interface OrderItem {
  menuItemId: string;
  name: string;
  priceRupees: number;
  pricePaise: number;
  quantity: number;
}

export interface LocalOrderInput {
  id?: string;
  tokenNo?: number;
  items: Array<{
    menuItemId?: string;
    id?: string;
    name: string;
    priceRupees?: number;
    pricePaise?: number;
    quantity?: number;
  }>;
  paymentMethod?: string;
  paymentStatus?: string;
  status?: string;
}

export interface LocalOrder {
  id: string;
  tokenNo: number;
  items: OrderItem[];
  totalPaise: number;
  totalRupees: number;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  readyAt?: string;
  deliveredAt?: string;
}

export interface GallaSummary {
  totalSalesRupees: number;
  cashSalesRupees: number;
  upiSalesRupees: number;
  expensesRupees: number;
  netCashInDrawerRupees: number;
  orderCount: number;
  currency: string;
}

export declare class LocalIndexedDB {
  init(): Promise<any>;
  get(storeName: string, key: string): Promise<any>;
  put(storeName: string, val: any): Promise<any>;
  getAll(storeName: string): Promise<any[]>;
  delete(storeName: string, key: string): Promise<boolean>;
}

export declare class LocalIndexedDBAdapter {
  init(): Promise<this>;
  getNextAtomicToken(): Promise<number>;
  resetDailyTokenCounter(): Promise<number>;
  createOrder(input: LocalOrderInput): Promise<{ ok: boolean; order: LocalOrder }>;
  updateOrderStatus(orderId: string, newStatus: string): Promise<{ ok: boolean; order: LocalOrder }>;
  getLiveOrders(): Promise<LocalOrder[]>;
  getAllOrders(): Promise<LocalOrder[]>;
  logGallaExpense(input: { category?: string; amountRupees: number; notes?: string }): Promise<{ ok: boolean; expense: any }>;
  getGallaSummary(): Promise<{ ok: boolean; summary: GallaSummary }>;
}

export declare class CloudHttpAdapter {
  constructor(baseUrl?: string);
  getNextAtomicToken(): Promise<number>;
  createOrder(input: any): Promise<any>;
  updateOrderStatus(orderId: string, status: string): Promise<any>;
  getLiveOrders(): Promise<any[]>;
  getGallaSummary(): Promise<any>;
}

export declare class DataAdapterFactory {
  static getAdapter(forceMode?: string | null): LocalIndexedDBAdapter | CloudHttpAdapter;
  static resolveHotspotAddress(): string;
}

declare const StorageModule: {
  LocalIndexedDB: typeof LocalIndexedDB;
  LocalIndexedDBAdapter: typeof LocalIndexedDBAdapter;
  CloudHttpAdapter: typeof CloudHttpAdapter;
  DataAdapterFactory: typeof DataAdapterFactory;
};

export default StorageModule;
