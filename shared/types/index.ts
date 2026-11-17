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

export type StaffRole = 'superadmin' | 'owner' | 'cashier' | 'cook' | 'packer';

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

export interface Expense {
  id: string;
  vendorId: string;
  amountPaise: number;
  amountRupees: number;
  description: string;
  title?: string;
  category: string;
  paymentMethod: 'cash' | 'upi';
  expenseDate: string;
  createdAt: string;
}

export interface GallaSummary {
  summaryDate: string;
  totalOrders: number;
  cancelledOrders: number;
  totalSalesPaise: number;
  cashSalesPaise: number;
  upiSalesPaise: number;
  totalExpensesPaise: number;
  cashExpensesPaise: number;
  upiExpensesPaise: number;
  cashInDrawerPaise: number;
  netProfitPaise: number;
  topSellingItem: string | null;
  totalSalesRupees: number;
  cashSalesRupees: number;
  upiSalesRupees: number;
  totalExpensesRupees: number;
  cashInDrawerRupees: number;
  netProfitRupees: number;
  isDayClosed: boolean;
}

export interface DailySummary {
  id?: string;
  vendorId: string;
  summaryDate: string;
  totalOrders: number;
  totalSalesPaise: number;
  cashSalesPaise: number;
  upiSalesPaise: number;
  totalExpensesPaise: number;
  netPaise: number;
  cancelledOrders: number;
  topSellingItem?: string | null;
  createdAt?: string;
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
