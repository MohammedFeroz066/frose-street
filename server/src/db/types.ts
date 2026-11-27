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
  subscription_status: 'trial' | 'active' | 'expired' | 'suspended';
  subscription_expires_at: Timestamp | null;
  suspended_reason?: string | null;
  monthly_fee_paise?: MoneyPaise;
  daily_token_counter: number;
  token_reset_date: string;
  password_hash: string | null;
  quick_pin_hash: string | null;
  is_superadmin?: boolean;
  tax_mode?: 'unregistered' | 'composition' | 'regular';
  gstin?: string | null;
  fssai_number?: string | null;
  gst_rate_bps?: number;
  stall_address?: string | null;
  upi_id?: string | null;
  payee_name?: string | null;
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
  is_superadmin?: boolean;
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

export interface MenuVariant {
  name: string;
  pricePaise: number;
}

export interface MenuItemsTable {
  id: Generated<string>;
  vendor_id: string;
  name: string;
  price_paise: MoneyPaise;
  category: string | null;
  emoji_icon: string | null;
  color_hex: string | null;
  image_url?: string | null;
  is_veg?: boolean;
  variants_json?: MenuVariant[] | string | null;
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
  cash_paise?: number;
  upi_paise?: number;
  payment_status: 'paid' | 'pending';
  order_status: 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';
  order_type?: 'dinein' | 'parcel';
  notes: string | null;
  source: 'pos' | 'qr_customer' | 'online';
  client_order_id?: string | null;
  created_at_client?: Timestamp | null;
  receipt_number?: string | null;
  subtotal_paise?: number;
  cgst_paise?: number;
  sgst_paise?: number;
  tax_mode_snapshot?: 'unregistered' | 'composition' | 'regular';
  cancel_reason?: string | null;
  edited_at?: Timestamp | null;
  edit_note?: string | null;
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
  cancelled_orders: Generated<number> | number;
  top_selling_item: string | null;
  counted_cash_paise?: MoneyPaise | null;
  created_at: Generated<Timestamp>;
}

export interface ExpensesTable {
  id: Generated<string>;
  vendor_id: string;
  description: string;
  amount_paise: MoneyPaise;
  category: Generated<string> | string;
  payment_method: Generated<string> | string;
  expense_date: Generated<string> | string;
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

export interface LoginLockoutsTable {
  id: string;
  key_type: 'account' | 'ip';
  key_value: string;
  consecutive_failures: number;
  locked_until: Timestamp | null;
  updated_at: Generated<Timestamp>;
}

export interface RefreshTokensTable {
  id: string;
  vendor_id: string;
  token_hash: string;
  family_id: string;
  is_revoked: boolean;
  expires_at: Timestamp;
  created_at: Generated<Timestamp>;
}

export interface AdminAuditLogsTable {
  id: Generated<string>;
  admin_id: string;
  action: string;
  target_vendor_id: string | null;
  details_json: string | null;
  ip_address: string | null;
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
  login_lockouts: LoginLockoutsTable;
  refresh_tokens: RefreshTokensTable;
  admin_audit_logs: AdminAuditLogsTable;
}
