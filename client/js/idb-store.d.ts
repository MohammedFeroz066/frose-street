export type OutboxStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface IdbMenuItem {
  id: string;
  vendor_id: string;
  name: string;
  category: string;
  pricePaise: number;
  imageUrl: string;
  image: string;
  isAvailable: boolean;
  isUserCreated: boolean;
  displayOrder: number;
  updatedAt: string;
}

export interface IdbOrderItem {
  menuItemId: string;
  name: string;
  quantity: number;
  pricePaise: number;
}

export interface IdbOrderRecord {
  client_order_id: string;
  id: string;
  vendor_id: string;
  tokenNo: number | null;
  tokenDisplay: string;
  localTokenDisplay: string | null;
  items: IdbOrderItem[];
  totalPaise: number;
  paymentMethod: string;
  paymentStatus: string;
  orderType: string;
  status: string;
  syncStatus: OutboxStatus;
  createdAt: string;
  updatedAt: string;
}

export interface IdbOutboxEntry {
  client_order_id: string;
  vendor_id: string;
  payload: Record<string, any>;
  status: OutboxStatus;
  retryCount: number;
  lastError: string | null;
  nextRetryAt: number;
  createdAt: string;
  updatedAt: string;
}

export interface FroseIdbStoreInstance {
  DB_NAME: string;
  DB_VERSION: number;
  STORES: string[];
  toSafeIntegerPaise(value: number | bigint | string, fieldName?: string): number;
  getIstDateString(dateInput?: Date | string): string;
  openDb(): Promise<IDBDatabase | null>;
  requestPersistentStorage(): Promise<boolean>;
  recordLastSeenAt(epochMs?: number): Promise<number>;
  checkClockRollback(epochMs?: number, toleranceMs?: number): Promise<{
    ok: boolean;
    code: string;
    lastSeenAt: number | null;
    currentNow: number;
  }>;
  clearAllStores(): Promise<boolean>;
  getMeta(key: string): Promise<any>;
  setMeta(key: string, valueObj: any): Promise<any>;
  deleteMeta(key: string): Promise<boolean>;
  getActiveVendorId(): Promise<string | null>;
  ensureVendorScope(vendorId: string): Promise<boolean>;
  putMenuItems(vendorId: string, items: any[]): Promise<IdbMenuItem[]>;
  getMenuItems(vendorId: string): Promise<IdbMenuItem[]>;
  upsertMenuItem(vendorId: string, item: any): Promise<IdbMenuItem>;
  deleteMenuItem(vendorId: string, itemId: string): Promise<boolean>;
  saveOrder(vendorId: string, order: any): Promise<IdbOrderRecord>;
  getOrders(vendorId: string): Promise<IdbOrderRecord[]>;
  getOrderByClientOrderId(clientOrderId: string): Promise<IdbOrderRecord | null>;
  updateOrder(clientOrderId: string, patch: Partial<IdbOrderRecord>): Promise<IdbOrderRecord | null>;
  enqueueOutbox(vendorId: string, entry: Partial<IdbOutboxEntry>): Promise<IdbOutboxEntry>;
  getOutbox(vendorId: string, statuses?: OutboxStatus[]): Promise<IdbOutboxEntry[]>;
  getPendingOutboxCount(vendorId: string): Promise<number>;
  updateOutboxItem(clientOrderId: string, patch: Partial<IdbOutboxEntry>): Promise<IdbOutboxEntry | null>;
  removeOutboxItem(clientOrderId: string): Promise<boolean>;
  recordOfflineOrderAtomic(
    vendorId: string,
    orderInput: any,
    outboxInput: any,
  ): Promise<{ order: IdbOrderRecord; outbox: IdbOutboxEntry }>;
  getNextOfflineToken(vendorId: string, istDateStr?: string): Promise<number>;
  inspectStoreCounts(): Promise<Record<string, number>>;
  clearSessionStorageKeys(): void;
  getUnsyncedOutboxCount(vendorId?: string): Promise<number>;
  safeLogout(options?: {
    vendorId?: string;
    confirmMessage?: string;
    confirmImpl?: (msg: string) => boolean;
    fetchImpl?: typeof fetch;
    redirectImpl?: (url: string) => void;
    redirectTo?: string;
    skipRedirect?: boolean;
  }): Promise<{ cancelled: boolean; wiped: boolean; unsyncedCount: number }>;
}

declare const FroseIdbStore: FroseIdbStoreInstance & {
  createIdbStore(options?: { indexedDB?: IDBFactory }): FroseIdbStoreInstance;
};

export default FroseIdbStore;
