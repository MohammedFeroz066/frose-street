import type { ColumnType, Generated } from 'kysely';

export type Timestamp = ColumnType<Date, Date | string, Date | string>;
export type MoneyPaise = ColumnType<bigint, bigint | number, bigint | number>;

export interface VendorsTable {
  id: Generated<string>;
  phone: string;
  business_name: string;
  owner_name: string;
  business_type: string;
  city: string | null;
  edition: 'cloud' | 'local';
  subscription_status: 'trial' | 'active' | 'expired' | 'suspended';
  subscription_expires_at: Timestamp | null;
  daily_token_counter: number;
  token_reset_date: string;
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
  token_number: number;
  status: 'placed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
  payment_method: 'upi' | 'cash';
  payment_status: 'pending' | 'paid' | 'failed';
  total_paise: MoneyPaise;
  upi_transaction_id: string | null;
  customer_phone: string | null;
  notes: string | null;
  placed_at: Generated<Timestamp>;
  ready_at: Timestamp | null;
  delivered_at: Timestamp | null;
  created_by_staff_id: string | null;
}

export interface OrderItemsTable {
  id: Generated<string>;
  order_id: string;
  menu_item_id: string;
  item_name: string;
  quantity: number;
  unit_price_paise: MoneyPaise;
  line_total_paise: MoneyPaise;
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
  cancelled_orders: number;
  top_selling_item: string | null;
  created_at: Generated<Timestamp>;
}

export interface ExpensesTable {
  id: Generated<string>;
  vendor_id: string;
  amount_paise: MoneyPaise;
  description: string;
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
  menu_items: MenuItemsTable;
  orders: OrdersTable;
  order_items: OrderItemsTable;
  daily_summaries: DailySummariesTable;
  expenses: ExpensesTable;
  subscriptions: SubscriptionsTable;
}
