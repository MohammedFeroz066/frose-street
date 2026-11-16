/**
 * FROSE Street Shared Types & Interfaces
 * Domain: street.frostech.com
 * All financial amounts are stored as INTEGER PAISE (bigint or number).
 */

export type BusinessType =
  | 'chai_point'
  | 'snack_stall'
  | 'momo_cart'
  | 'juice_bar'
  | 'shawarma_stand'
  | 'dosa_cart'
  | 'biryani_counter'
  | 'food_truck'
  | 'other';

export type PortalType = 'billing' | 'packaging' | 'kitchen';

export type BackendEdition = 'cloud' | 'local';

export type StaffRole = 'owner' | 'cashier' | 'cook' | 'packer';

export type OrderStatus = 'placed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';

export type PaymentMethod = 'upi' | 'cash';

export type PaymentStatus = 'pending' | 'paid' | 'failed';

export interface Vendor {
  id: string;
  phone: string;
  businessName: string;
  ownerName: string;
  businessType: BusinessType;
  city?: string;
  edition: BackendEdition;
  subscriptionStatus: 'trial' | 'active' | 'expired' | 'suspended';
  subscriptionExpiresAt?: string;
  dailyTokenCounter: number;
  tokenResetDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface MenuItem {
  id: string;
  vendorId: string;
  name: string;
  pricePaise: number; // Stored in paise: ₹80 = 8000 paise
  category?: string;
  emojiIcon?: string;
  colorHex?: string;
  displayOrder: number;
  isAvailable: boolean;
  isActive: boolean;
}

export interface OrderItem {
  id: string;
  orderId: string;
  menuItemId: string;
  itemName: string;
  quantity: number;
  unitPricePaise: number;
  lineTotalPaise: number;
}

export interface Order {
  id: string;
  vendorId: string;
  tokenNumber: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  totalPaise: number;
  upiTransactionId?: string;
  customerPhone?: string;
  notes?: string;
  placedAt: string;
  readyAt?: string;
  deliveredAt?: string;
  items: OrderItem[];
}

export interface DailySummary {
  vendorId: string;
  summaryDate: string;
  totalOrders: number;
  totalSalesPaise: number;
  cashSalesPaise: number;
  upiSalesPaise: number;
  totalExpensesPaise: number;
  netPaise: number;
  cancelledOrders: number;
  topSellingItem?: string;
}

export interface HealthCheckResponse {
  status: 'ok';
  service: 'frose-street';
  version: string;
  timestamp: string;
  portals: {
    billing: string;
    packaging: string;
    kitchen: string;
  };
}
