import type { Generated } from 'kysely';

export type Timestamp = Date | string;
export type MoneyPaise = number | bigint;

export interface VendorsTable {
  id: Generated<string>;
  phone: string;
  business_name: string;
  owner_name: string;
  business_type: string;
  city: string | null;
  edition: 'cloud' | 'local';
  subscription_status: 'trial' | 'active' | 'expired';
  subscription_expires_at: Timestamp | null;
  daily_token_counter: number;
  token_reset_date: string;
  password_hash: string | null;
  quick_pin_hash: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface StaffTable {
  id: Generated<string>;
  vendor_id: string;
  name: string;
  role: 'owner' | 'cashier' | 'cook' | 'packer';
  phone: string | null;
  is_active: boolean;
  password_hash: string | null;
  quick_pin_hash: string | null;
  created_at: Generated<Timestamp>;
}

export interface DevicesTable {
  id: Generated<string>;
  vendor_id: string;
  device_name: string;
  role: 'cook' | 'packer' | 'cashier';
  token_hash: string;
  is_active: boolean;
  last_seen_at: Timestamp | null;
  created_at: Generated<Timestamp>;
}

export interface BiometricCredentialsTable {
  id: Generated<string>;
  vendor_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  device_name: string | null;
  created_at: Generated<Timestamp>;
}

export interface MenuItemsTable {
  id: Generated<string>;
  vendor_id: string;
  name: string;
  price_paise: MoneyPaise;
  category: string | null;
  emoji_icon: string | null;
  color_hex: string | null;
  display_order: number;
  is_available: boolean;
  is_active: boolean;
  created_at: Generated<Timestamp>;
}

export interface OrdersTable {
  id: Generated<string>;
  vendor_id: string;
  token_no: number;
  customer_name: string | null;
  customer_phone: string | null;
  total_paise: MoneyPaise;
  payment_method: 'cash' | 'upi' | 'split';
  payment_status: 'paid' | 'pending';
  order_status: 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';
  notes: string | null;
  source: 'pos' | 'qr_customer' | 'online';
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface OrderItemsTable {
  id: Generated<string>;
  order_id: string;
  menu_item_id: string;
  item_name: string;
  quantity: number;
  unit_price_paise: MoneyPaise;
  line_total_paise: MoneyPaise;
  notes: string | null;
}

export interface DailySummariesTable {
  id: Generated<string>;
  vendor_id: string;
  summary_date: string;
  total_orders: number;
  total_sales_paise: MoneyPaise;
  cash_sales_paise: MoneyPaise;
  upi_sales_paise: MoneyPaise;
  total_expenses_paise: MoneyPaise;
  net_paise: MoneyPaise;
  created_at: Generated<Timestamp>;
}

export interface ExpensesTable {
  id: Generated<string>;
  vendor_id: string;
  title: string;
  amount_paise: MoneyPaise;
  category: string;
  expense_date: string;
  created_at: Generated<Timestamp>;
}

export interface SubscriptionsTable {
  id: Generated<string>;
  vendor_id: string;
  plan: 'cloud' | 'local';
  amount_paise: MoneyPaise;
  period_start: string;
  period_end: string;
  payment_method: string;
  payment_reference: string | null;
  status: 'active' | 'expired' | 'refunded';
  created_at: Generated<Timestamp>;
}

export interface Database {
  vendors: VendorsTable;
  staff: StaffTable;
  devices: DevicesTable;
  biometric_credentials: BiometricCredentialsTable;
  menu_items: MenuItemsTable;
  orders: OrdersTable;
  order_items: OrderItemsTable;
  daily_summaries: DailySummariesTable;
  expenses: ExpensesTable;
  subscriptions: SubscriptionsTable;
}
