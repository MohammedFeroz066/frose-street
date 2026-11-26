import { sql, type Kysely } from 'kysely';
import type { Database } from '../../db/types.js';
import type { StaffRole } from '../../../../shared/types/index.js';
import { AppError } from '../../errors/app-error.js';
import { WebSocketHub } from '../websocket/websocket.hub.js';
import { SubscriptionService } from '../subscriptions/subscription.service.js';
import {
  getIstDateString,
  normalizeDateColumnString,
  getIndianFinancialYearCode,
  formatReceiptNumber,
} from '../../utils/ist-date.js';
import { calculateOrderTax, type VendorTaxMode } from '../../utils/tax-calculator.js';
import { parseVariantsJson } from '../menu/menu.service.js';

export interface CreateOrderItemInput {
  menuItemId: string;
  quantity: number;
  notes?: string;
  variantName?: string;
}

export interface CreateOrderInput {
  items: CreateOrderItemInput[];
  paymentMethod: 'cash' | 'upi' | 'split';
  cashPaise?: number;
  upiPaise?: number;
  paymentStatus?: 'paid' | 'pending';
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  orderType?: 'dinein' | 'parcel' | 'counter' | 'takeaway';
  source?: 'pos' | 'qr_customer' | 'online';
  clientOrderId?: string;
  createdAtClient?: string;
}

export interface UpdateOrderInput {
  items: CreateOrderItemInput[];
  paymentMethod?: 'cash' | 'upi' | 'split';
  cashPaise?: number;
  upiPaise?: number;
  notes?: string | null;
  orderType?: 'dinein' | 'parcel' | 'counter' | 'takeaway';
  editNote?: string;
}

export function normalizeOrderType(raw?: string | null, notes?: string | null): 'dinein' | 'parcel' {
  const norm = String(raw || '').trim().toLowerCase();
  if (norm === 'parcel' || norm === 'counter' || norm === 'takeaway') return 'parcel';
  if (norm === 'dinein') return 'dinein';
  const notesLower = String(notes || '').toLowerCase();
  if (notesLower.includes('parcel') || notesLower.includes('takeaway') || notesLower.includes('pack')) {
    return 'parcel';
  }
  return 'dinein';
}

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';

export function resolveOrderPaymentAmounts(order: {
  total_paise: unknown;
  payment_method: string;
  cash_paise?: unknown;
  upi_paise?: unknown;
}): { cashPaise: number; upiPaise: number } {
  const total = Number(order.total_paise || 0);
  const cash = Number(order.cash_paise ?? 0);
  const upi = Number(order.upi_paise ?? 0);
  if (cash === 0 && upi === 0 && total > 0) {
    if (order.payment_method === 'cash') return { cashPaise: total, upiPaise: 0 };
    if (order.payment_method === 'upi') return { cashPaise: 0, upiPaise: total };
  }
  return { cashPaise: cash, upiPaise: upi };
}

function resolveSplitPaymentAmounts(
  paymentMethod: 'cash' | 'upi' | 'split',
  totalPaise: number,
  cashPaise?: number,
  upiPaise?: number,
): { cashPaise: number; upiPaise: number } {
  if (paymentMethod === 'cash') {
    return { cashPaise: totalPaise, upiPaise: 0 };
  }
  if (paymentMethod === 'upi') {
    return { cashPaise: 0, upiPaise: totalPaise };
  }
  if (
    typeof cashPaise !== 'number' ||
    typeof upiPaise !== 'number' ||
    !Number.isSafeInteger(cashPaise) ||
    !Number.isSafeInteger(upiPaise) ||
    cashPaise < 0 ||
    upiPaise < 0 ||
    cashPaise + upiPaise !== totalPaise ||
    (cashPaise === 0 && upiPaise === 0)
  ) {
    throw AppError.badRequest(
      'Split payment requires non-negative integer cashPaise and upiPaise summing exactly to totalPaise',
      'INVALID_SPLIT_PAYMENT',
    );
  }
  return { cashPaise, upiPaise };
}

const DEFAULT_PRESET_ITEMS_MAP = new Map<string, any>([
  ['def-1', { id: 'def-1', name: 'Veg Steamed Momos', price_paise: 6000, is_available: true, is_active: true }],
  ['def-2', { id: 'def-2', name: 'Chicken Steamed Momos', price_paise: 8000, is_available: true, is_active: true }],
  ['def-3', { id: 'def-3', name: 'Veg Fried Momos', price_paise: 7000, is_available: true, is_active: true }],
  ['def-4', { id: 'def-4', name: 'Chicken Fried Momos', price_paise: 9000, is_available: true, is_active: true }],
  ['def-5', { id: 'def-5', name: 'Veg Hakka Noodles', price_paise: 8000, is_available: true, is_active: true }],
  ['def-6', { id: 'def-6', name: 'Chicken Hakka Noodles', price_paise: 11000, is_available: true, is_active: true }],
  ['def-7', { id: 'def-7', name: 'Special Masala Chai', price_paise: 1500, is_available: true, is_active: true }],
  ['def-8', { id: 'def-8', name: 'Chilled Thums Up 250ml', price_paise: 2000, is_available: true, is_active: true }],
]);

export class OrderService {
  /**
   * Creates a new order with atomic daily token generation and 100% integer paise math
   */
  static async createOrder(db: Kysely<Database>, vendorId: string, input: CreateOrderInput) {
    if (!input.items || !Array.isArray(input.items) || input.items.length === 0) {
      throw AppError.badRequest('Order must contain at least one menu item', 'EMPTY_ORDER');
    }

    if (!['cash', 'upi', 'split'].includes(input.paymentMethod)) {
      throw AppError.badRequest('Invalid payment method. Allowed: cash, upi, split', 'INVALID_PAYMENT_METHOD');
    }

    // 1. Fetch vendor (with row-level lock on PostgreSQL to serialize concurrent token & idempotency checks)
    const isRealPg = process.env.USE_MEMORY_DB !== 'true' && typeof (db as any)?.getExecutor === 'function';
    let vendor: any;
    if (isRealPg) {
      const locked = await sql<any>`SELECT * FROM vendors WHERE id = ${vendorId} FOR UPDATE`.execute(db);
      vendor = locked.rows[0];
    } else {
      vendor = await db
        .selectFrom('vendors')
        .selectAll()
        .where('id', '=', vendorId)
        .executeTakeFirst();
    }

    if (!vendor) {
      throw AppError.notFound('Vendor stall not found', 'VENDOR_NOT_FOUND');
    }

    // 1b. Idempotency check BEFORE incrementing daily token counter or double-counting Galla
    const clientOrderId = input.clientOrderId ? input.clientOrderId.trim() : null;
    if (clientOrderId) {
      const existingOrder = await db
        .selectFrom('orders')
        .selectAll()
        .where('vendor_id', '=', vendorId)
        .where('client_order_id', '=', clientOrderId)
        .executeTakeFirst();

      if (existingOrder) {
        const existingItems = await db
          .selectFrom('order_items')
          .selectAll()
          .where('order_id', '=', existingOrder.id)
          .execute();

        const existingPayment = resolveOrderPaymentAmounts(existingOrder);
        return {
          id: existingOrder.id,
          vendorId: existingOrder.vendor_id,
          tokenNo: existingOrder.token_no,
          tokenDisplay: `#${existingOrder.token_no}`,
          receiptNumber: existingOrder.receipt_number ?? null,
          subtotalPaise: Number(existingOrder.subtotal_paise ?? existingOrder.total_paise),
          cgstPaise: Number(existingOrder.cgst_paise ?? 0),
          sgstPaise: Number(existingOrder.sgst_paise ?? 0),
          taxModeSnapshot: (existingOrder.tax_mode_snapshot as VendorTaxMode) || 'unregistered',
          cancelReason: existingOrder.cancel_reason ?? null,
          editedAt: existingOrder.edited_at ?? null,
          editNote: existingOrder.edit_note ?? null,
          totalPaise: Number(existingOrder.total_paise),
          totalRupees: Number(existingOrder.total_paise) / 100,
          paymentMethod: existingOrder.payment_method,
          cashPaise: existingPayment.cashPaise,
          upiPaise: existingPayment.upiPaise,
          paymentStatus: existingOrder.payment_status,
          orderStatus: existingOrder.order_status,
          customerName: existingOrder.customer_name,
          customerPhone: existingOrder.customer_phone,
          orderType: normalizeOrderType(existingOrder.order_type, existingOrder.notes),
          notes: existingOrder.notes,
          source: existingOrder.source,
          clientOrderId: existingOrder.client_order_id ?? clientOrderId,
          createdAtClient: existingOrder.created_at_client ?? null,
          items: existingItems.map((i) => ({
            id: i.id,
            menuItemId: i.menu_item_id,
            itemName: i.item_name,
            quantity: i.quantity,
            unitPricePaise: Number(i.unit_price_paise),
            lineTotalPaise: Number(i.line_total_paise),
            notes: i.notes,
          })),
          createdAt: existingOrder.created_at,
          idempotentReplay: true,
        };
      }
    }

    // Verify subscription status (read-only lock if grace period has expired)
    try {
      const subStatus = await SubscriptionService.getSubscriptionStatus(db, vendorId);
      if (subStatus.isReadOnly) {
        throw AppError.forbidden('Subscription expired and grace period ended. Account is in read-only mode.', 'SUBSCRIPTION_EXPIRED');
      }
    } catch (err: any) {
      if (err.code === 'SUBSCRIPTION_EXPIRED') throw err;
    }

    const todayDateString = getIstDateString();
    let nextToken = 1;

    if (isRealPg) {
      const updatedVendor = await sql<{ daily_token_counter: number }>`
        UPDATE vendors
        SET
          daily_token_counter = CASE
            WHEN token_reset_date = ${todayDateString}::date THEN daily_token_counter + 1
            ELSE 1
          END,
          token_reset_date = ${todayDateString}::date
        WHERE id = ${vendorId}
        RETURNING daily_token_counter
      `.execute(db);
      nextToken = Number(updatedVendor.rows[0]?.daily_token_counter ?? 1);
    } else {
      const lastResetDate = normalizeDateColumnString(vendor.token_reset_date);
      if (lastResetDate === todayDateString) {
        nextToken = (vendor.daily_token_counter || 0) + 1;
      } else {
        // Midnight IST date rollover: Reset counter to 1 for the new IST business day
        nextToken = 1;
      }

      await db
        .updateTable('vendors')
        .set({
          daily_token_counter: nextToken,
          token_reset_date: todayDateString,
        })
        .where('id', '=', vendorId)
        .execute();
    }

    // 2. Validate menu items and compute integer paise totals
    const { subtotalPaise, computedLineItems } = await this.resolveLineItems(db, vendorId, input.items);

    // 2b. Compute integer-paise tax breakdown from vendor's tax profile
    const vendorTaxMode: VendorTaxMode =
      vendor.tax_mode === 'composition' || vendor.tax_mode === 'regular' ? vendor.tax_mode : 'unregistered';
    const vendorGstRateBps =
      vendorTaxMode === 'regular' ? Number(vendor.gst_rate_bps ?? 500) : 0;
    const taxBreakdown = calculateOrderTax({
      subtotalPaise,
      taxMode: vendorTaxMode,
      gstRateBps: vendorGstRateBps,
    });

    const splitAmounts = resolveSplitPaymentAmounts(
      input.paymentMethod,
      taxBreakdown.totalPaise,
      input.cashPaise,
      input.upiPaise,
    );

    // 2c. Generate sequential Indian Financial Year receipt number atomically (under vendor FOR UPDATE lock)
    const fyCode = getIndianFinancialYearCode(new Date());
    const receiptPrefix = `FS-${fyCode}-`;
    let nextReceiptSeq = 1;

    if (isRealPg) {
      const seqRes = await sql<{ max_seq: number }>`
        SELECT COALESCE(MAX(CAST(SPLIT_PART(receipt_number, '-', 3) AS INTEGER)), 0) AS max_seq
        FROM orders
        WHERE vendor_id = ${vendorId}
          AND receipt_number LIKE ${receiptPrefix + '%'}
      `.execute(db);
      nextReceiptSeq = Number(seqRes.rows[0]?.max_seq ?? 0) + 1;
    } else {
      const existingVendorOrders = await db
        .selectFrom('orders')
        .selectAll()
        .where('vendor_id', '=', vendorId)
        .execute();
      let maxSeq = 0;
      for (const ord of existingVendorOrders) {
        const rn = typeof ord.receipt_number === 'string' ? ord.receipt_number : '';
        if (rn.startsWith(receiptPrefix)) {
          const seqPart = parseInt(rn.slice(receiptPrefix.length), 10);
          if (Number.isInteger(seqPart) && seqPart > maxSeq) {
            maxSeq = seqPart;
          }
        }
      }
      nextReceiptSeq = maxSeq + 1;
    }
    const receiptNumber = formatReceiptNumber(fyCode, nextReceiptSeq);

    // 3. Insert order record
    const paymentStatus = input.paymentStatus || 'paid';
    const initialStatus: OrderStatus = 'preparing';
    const normalizedNotes = input.notes?.trim() || null;
    const normalizedOrderType = normalizeOrderType(input.orderType, normalizedNotes);

    const order = await db
      .insertInto('orders')
      .values({
        vendor_id: vendorId,
        token_no: nextToken,
        receipt_number: receiptNumber,
        subtotal_paise: taxBreakdown.subtotalPaise,
        cgst_paise: taxBreakdown.cgstPaise,
        sgst_paise: taxBreakdown.sgstPaise,
        tax_mode_snapshot: taxBreakdown.taxMode,
        cancel_reason: null,
        customer_name: input.customerName?.trim() || null,
        customer_phone: input.customerPhone?.replace(/\D/g, '') || null,
        total_paise: BigInt(taxBreakdown.totalPaise),
        payment_method: input.paymentMethod,
        cash_paise: splitAmounts.cashPaise,
        upi_paise: splitAmounts.upiPaise,
        payment_status: paymentStatus,
        order_status: initialStatus,
        order_type: normalizedOrderType,
        notes: normalizedNotes,
        source: input.source || 'pos',
        client_order_id: clientOrderId,
        created_at_client: input.createdAtClient ? new Date(input.createdAtClient) : null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // 4. Insert order line items
    const insertedLineItems: any[] = [];
    for (const line of computedLineItems) {
      const inserted = await db
        .insertInto('order_items')
        .values({
          order_id: order.id,
          menu_item_id: line.menuItemId,
          item_name: line.itemName,
          quantity: line.quantity,
          unit_price_paise: BigInt(line.unitPricePaise),
          line_total_paise: BigInt(line.lineTotalPaise),
          notes: line.notes,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      insertedLineItems.push({
        id: inserted.id,
        menuItemId: inserted.menu_item_id,
        itemName: inserted.item_name,
        quantity: inserted.quantity,
        unitPricePaise: Number(inserted.unit_price_paise),
        lineTotalPaise: Number(inserted.line_total_paise),
        notes: inserted.notes,
      });
    }

    const createdOrder = {
      id: order.id,
      vendorId: order.vendor_id,
      tokenNo: order.token_no,
      tokenDisplay: `#${order.token_no}`,
      receiptNumber: order.receipt_number ?? receiptNumber,
      subtotalPaise: Number(order.subtotal_paise ?? taxBreakdown.subtotalPaise),
      cgstPaise: Number(order.cgst_paise ?? taxBreakdown.cgstPaise),
      sgstPaise: Number(order.sgst_paise ?? taxBreakdown.sgstPaise),
      taxModeSnapshot: (order.tax_mode_snapshot as VendorTaxMode) || taxBreakdown.taxMode,
      gstRateBps: taxBreakdown.gstRateBps,
      cancelReason: order.cancel_reason ?? null,
      editedAt: order.edited_at ?? null,
      editNote: order.edit_note ?? null,
      totalPaise: Number(order.total_paise),
      totalRupees: Number(order.total_paise) / 100,
      paymentMethod: order.payment_method,
      cashPaise: Number(order.cash_paise ?? splitAmounts.cashPaise),
      upiPaise: Number(order.upi_paise ?? splitAmounts.upiPaise),
      paymentStatus: order.payment_status,
      orderStatus: order.order_status,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      orderType: normalizeOrderType(order.order_type, order.notes),
      notes: order.notes,
      source: order.source,
      clientOrderId: order.client_order_id ?? null,
      createdAtClient: order.created_at_client ?? null,
      items: insertedLineItems,
      createdAt: order.created_at,
    };

    // Sub-500ms Real-Time broadcast to Kitchen Display & Packaging Station
    WebSocketHub.broadcast(vendorId, 'order:new', createdOrder);

    return createdOrder;
  }

  private static async resolveLineItems(
    db: Kysely<Database>,
    vendorId: string,
    items: CreateOrderItemInput[],
    allowUnavailableIds?: Set<string>,
  ) {
    const itemIds = items.map((i) => i.menuItemId);
    const menuItems = await db
      .selectFrom('menu_items')
      .selectAll()
      .where('vendor_id', '=', vendorId)
      .where('id', 'in', itemIds)
      .where('is_active', '=', true)
      .execute();

    const menuItemsMap = new Map(menuItems.map((m) => [m.id, m]));

    let subtotalPaise = 0;
    const computedLineItems: {
      menuItemId: string;
      itemName: string;
      quantity: number;
      unitPricePaise: number;
      lineTotalPaise: number;
      notes: string | null;
    }[] = [];

    for (const itemInput of items) {
      if (!itemInput.quantity || !Number.isInteger(itemInput.quantity) || itemInput.quantity <= 0) {
        throw AppError.badRequest(`Invalid quantity for item ${itemInput.menuItemId}`, 'INVALID_QUANTITY');
      }

      let menuItem = menuItemsMap.get(itemInput.menuItemId);
      if (!menuItem && DEFAULT_PRESET_ITEMS_MAP.has(itemInput.menuItemId)) {
        menuItem = DEFAULT_PRESET_ITEMS_MAP.get(itemInput.menuItemId);
      }
      if (!menuItem) {
        throw AppError.badRequest(`Menu item "${itemInput.menuItemId}" does not exist in stall menu`, 'ITEM_NOT_FOUND');
      }

      if (!menuItem.is_available && !allowUnavailableIds?.has(menuItem.id)) {
        throw AppError.badRequest(
          `Item "${menuItem.name}" is currently marked out of stock and cannot be ordered`,
          'ITEM_OUT_OF_STOCK',
        );
      }

      let unitPricePaise = Number(menuItem.price_paise);
      let itemName = menuItem.name;

      if (itemInput.variantName && itemInput.variantName.trim().length > 0) {
        const variants = parseVariantsJson((menuItem as any).variants_json);
        const target = itemInput.variantName.trim().toLowerCase();
        const matchedVariant = variants?.find((v) => v.name.toLowerCase() === target);
        if (!matchedVariant) {
          throw AppError.badRequest(
            `Variant "${itemInput.variantName}" is not available for "${menuItem.name}"`,
            'INVALID_VARIANT',
          );
        }
        unitPricePaise = matchedVariant.pricePaise;
        itemName = `${menuItem.name} (${matchedVariant.name})`;
      }

      const lineTotalPaise = unitPricePaise * itemInput.quantity;
      subtotalPaise += lineTotalPaise;

      computedLineItems.push({
        menuItemId: menuItem.id,
        itemName,
        quantity: itemInput.quantity,
        unitPricePaise,
        lineTotalPaise,
        notes: itemInput.notes?.trim() || null,
      });
    }

    return { subtotalPaise, computedLineItems };
  }

  /**
   * Atomically updates items, notes, and split payment mode on a non-cancelled order
   */
  static async updateOrder(
    db: Kysely<Database>,
    vendorId: string,
    orderId: string,
    input: UpdateOrderInput,
  ) {
    if (!input.items || !Array.isArray(input.items) || input.items.length === 0) {
      throw AppError.badRequest('Order must contain at least one menu item', 'EMPTY_ORDER');
    }

    const isRealPg = process.env.USE_MEMORY_DB !== 'true' && typeof (db as any)?.getExecutor === 'function';
    let order: any;
    let vendor: any;

    if (isRealPg) {
      const ordRes = await sql<any>`
        SELECT * FROM orders WHERE id = ${orderId} AND vendor_id = ${vendorId} FOR UPDATE
      `.execute(db);
      order = ordRes.rows[0];
      const vRes = await sql<any>`
        SELECT * FROM vendors WHERE id = ${vendorId} FOR UPDATE
      `.execute(db);
      vendor = vRes.rows[0];
    } else {
      order = await db
        .selectFrom('orders')
        .selectAll()
        .where('id', '=', orderId)
        .where('vendor_id', '=', vendorId)
        .executeTakeFirst();
      vendor = await db
        .selectFrom('vendors')
        .selectAll()
        .where('id', '=', vendorId)
        .executeTakeFirst();
    }

    if (!order) {
      throw AppError.notFound('Order not found', 'ORDER_NOT_FOUND');
    }

    if (order.order_status === 'cancelled') {
      throw AppError.badRequest('Cancelled orders cannot be edited', 'ORDER_CANCELLED_UNEDITABLE');
    }

    const existingItems = await db
      .selectFrom('order_items')
      .selectAll()
      .where('order_id', '=', order.id)
      .execute();
    const existingIds = new Set(existingItems.map((i) => i.menu_item_id));

    const { subtotalPaise, computedLineItems } = await this.resolveLineItems(
      db,
      vendorId,
      input.items,
      existingIds,
    );

    const vendorTaxMode: VendorTaxMode =
      vendor?.tax_mode === 'composition' || vendor?.tax_mode === 'regular' ? vendor.tax_mode : 'unregistered';
    const vendorGstRateBps =
      vendorTaxMode === 'regular' ? Number(vendor?.gst_rate_bps ?? 500) : 0;
    const taxBreakdown = calculateOrderTax({
      subtotalPaise,
      taxMode: vendorTaxMode,
      gstRateBps: vendorGstRateBps,
    });

    const nextPaymentMethod = (input.paymentMethod || order.payment_method || 'cash') as 'cash' | 'upi' | 'split';
    const splitAmounts = resolveSplitPaymentAmounts(
      nextPaymentMethod,
      taxBreakdown.totalPaise,
      input.cashPaise,
      input.upiPaise,
    );

    const editedAt = new Date();
    const editNote = input.editNote?.trim() || null;
    const nextNotes = input.notes === undefined ? order.notes : (input.notes ? input.notes.trim() : null);
    const nextOrderType = input.orderType !== undefined
      ? normalizeOrderType(input.orderType, nextNotes)
      : normalizeOrderType(order.order_type, order.notes);

    await db
      .deleteFrom('order_items')
      .where('order_id', '=', order.id)
      .execute();

    const updatedLineItems: any[] = [];
    for (const line of computedLineItems) {
      const inserted = await db
        .insertInto('order_items')
        .values({
          order_id: order.id,
          menu_item_id: line.menuItemId,
          item_name: line.itemName,
          quantity: line.quantity,
          unit_price_paise: BigInt(line.unitPricePaise),
          line_total_paise: BigInt(line.lineTotalPaise),
          notes: line.notes,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      updatedLineItems.push({
        id: inserted.id,
        menuItemId: inserted.menu_item_id,
        itemName: inserted.item_name,
        quantity: inserted.quantity,
        unitPricePaise: Number(inserted.unit_price_paise),
        lineTotalPaise: Number(inserted.line_total_paise),
        notes: inserted.notes,
      });
    }

    await db
      .updateTable('orders')
      .set({
        subtotal_paise: taxBreakdown.subtotalPaise,
        cgst_paise: taxBreakdown.cgstPaise,
        sgst_paise: taxBreakdown.sgstPaise,
        tax_mode_snapshot: taxBreakdown.taxMode,
        total_paise: BigInt(taxBreakdown.totalPaise),
        payment_method: nextPaymentMethod,
        cash_paise: splitAmounts.cashPaise,
        upi_paise: splitAmounts.upiPaise,
        order_type: nextOrderType,
        notes: nextNotes,
        edited_at: editedAt,
        edit_note: editNote,
        updated_at: editedAt,
      })
      .where('id', '=', order.id)
      .where('vendor_id', '=', vendorId)
      .execute();

    const updatedOrder = {
      id: order.id,
      vendorId: order.vendor_id,
      tokenNo: order.token_no,
      tokenDisplay: `#${order.token_no}`,
      receiptNumber: order.receipt_number ?? null,
      subtotalPaise: taxBreakdown.subtotalPaise,
      cgstPaise: taxBreakdown.cgstPaise,
      sgstPaise: taxBreakdown.sgstPaise,
      taxModeSnapshot: taxBreakdown.taxMode,
      gstRateBps: taxBreakdown.gstRateBps,
      cancelReason: order.cancel_reason ?? null,
      editedAt: editedAt.toISOString(),
      editNote,
      totalPaise: taxBreakdown.totalPaise,
      totalRupees: taxBreakdown.totalPaise / 100,
      paymentMethod: nextPaymentMethod,
      cashPaise: splitAmounts.cashPaise,
      upiPaise: splitAmounts.upiPaise,
      paymentStatus: order.payment_status,
      orderStatus: order.order_status,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      orderType: nextOrderType,
      notes: nextNotes,
      source: order.source,
      items: updatedLineItems,
      createdAt: order.created_at,
      updatedAt: editedAt.toISOString(),
    };

    WebSocketHub.broadcast(vendorId, 'order:updated', updatedOrder);

    return updatedOrder;
  }

  /**
   * Updates order lifecycle state enforcing valid transitions
   */
  static async updateOrderStatus(
    db: Kysely<Database>,
    vendorId: string,
    orderId: string,
    newStatus: OrderStatus,
    userRole: StaffRole,
    reason?: string,
  ) {
    const order = await db
      .selectFrom('orders')
      .selectAll()
      .where('id', '=', orderId)
      .where('vendor_id', '=', vendorId)
      .executeTakeFirst();

    if (!order) {
      throw AppError.notFound('Order not found', 'ORDER_NOT_FOUND');
    }

    const currentStatus = order.order_status as OrderStatus;

    if (currentStatus === newStatus) {
      return {
        id: order.id,
        tokenNo: order.token_no,
        previousStatus: currentStatus,
        newStatus,
        cancelReason: order.cancel_reason ?? null,
        updatedAt: new Date().toISOString(),
      };
    }

    // Role-based state transition restrictions
    if (newStatus === 'cancelled' && !['owner', 'cashier'].includes(userRole)) {
      throw AppError.forbidden('Only cashier or owner can cancel an order', 'CANCEL_FORBIDDEN');
    }

    const cleanReason = typeof reason === 'string' ? reason.trim() : '';
    if (newStatus === 'cancelled' && cleanReason.length < 3) {
      throw AppError.badRequest(
        'A cancellation/void reason of at least 3 characters is required',
        'CANCEL_REASON_REQUIRED',
      );
    }

    // Valid state transitions
    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      pending: ['preparing', 'ready', 'cancelled'],
      preparing: ['ready', 'cancelled'],
      ready: ['served', 'cancelled'],
      served: [], // Terminal state
      cancelled: [], // Terminal state
    };

    const allowed = validTransitions[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      throw AppError.badRequest(
        `Invalid status transition from "${currentStatus}" to "${newStatus}"`,
        'INVALID_STATUS_TRANSITION',
      );
    }

    const updateSet: Record<string, any> = {
      order_status: newStatus,
      updated_at: new Date(),
    };
    if (newStatus === 'cancelled') {
      updateSet.cancel_reason = cleanReason;
    }

    await db
      .updateTable('orders')
      .set(updateSet)
      .where('id', '=', orderId)
      .where('vendor_id', '=', vendorId)
      .execute();

    const result = {
      id: order.id,
      tokenNo: order.token_no,
      previousStatus: currentStatus,
      newStatus,
      cancelReason: newStatus === 'cancelled' ? cleanReason : (order.cancel_reason ?? null),
      updatedAt: new Date().toISOString(),
    };

    // Broadcast status change in real time to connected screens
    WebSocketHub.broadcast(vendorId, 'order:status_changed', result);

    return result;
  }

  /**
   * Retrieves active live orders for kitchen and packaging queues
   */
  static async getLiveOrders(db: Kysely<Database>, vendorId: string) {
    const orders = await db
      .selectFrom('orders')
      .selectAll()
      .where('vendor_id', '=', vendorId)
      .where('order_status', 'in', ['pending', 'preparing', 'ready'])
      .orderBy('created_at', 'asc')
      .execute();

    const orderIds = orders.map((o) => o.id);
    let items: any[] = [];

    if (orderIds.length > 0) {
      items = await db
        .selectFrom('order_items')
        .selectAll()
        .where('order_id', 'in', orderIds)
        .execute();
    }

    const itemsByOrderId = new Map<string, any[]>();
    for (const item of items) {
      if (!itemsByOrderId.has(item.order_id)) {
        itemsByOrderId.set(item.order_id, []);
      }
      itemsByOrderId.get(item.order_id)!.push({
        id: item.id,
        menuItemId: item.menu_item_id,
        itemName: item.item_name,
        quantity: item.quantity,
        notes: item.notes,
      });
    }

    const formattedOrders = orders.map((o) => {
      const pay = resolveOrderPaymentAmounts(o);
      return {
        id: o.id,
        tokenNo: o.token_no,
        tokenDisplay: `#${o.token_no}`,
        totalPaise: Number(o.total_paise),
        totalRupees: Number(o.total_paise) / 100,
        paymentMethod: o.payment_method,
        cashPaise: pay.cashPaise,
        upiPaise: pay.upiPaise,
        orderStatus: o.order_status,
        orderType: normalizeOrderType(o.order_type, o.notes),
        customerName: o.customer_name,
        notes: o.notes,
        editedAt: o.edited_at ?? null,
        editNote: o.edit_note ?? null,
        items: itemsByOrderId.get(o.id) || [],
        createdAt: o.created_at,
      };
    });

    return {
      kitchenQueue: formattedOrders.filter((o) => o.orderStatus === 'pending' || o.orderStatus === 'preparing'),
      packagingQueue: formattedOrders.filter((o) => o.orderStatus === 'ready'),
      totalActive: formattedOrders.length,
    };
  }

  /**
   * Retrieves order by ID with line items
   */
  static async getOrderById(db: Kysely<Database>, vendorId: string, orderId: string) {
    const order = await db
      .selectFrom('orders')
      .selectAll()
      .where('id', '=', orderId)
      .where('vendor_id', '=', vendorId)
      .executeTakeFirst();

    if (!order) {
      throw AppError.notFound('Order not found', 'ORDER_NOT_FOUND');
    }

    const items = await db
      .selectFrom('order_items')
      .selectAll()
      .where('order_id', '=', order.id)
      .execute();

    const pay = resolveOrderPaymentAmounts(order);
    return {
      id: order.id,
      vendorId: order.vendor_id,
      tokenNo: order.token_no,
      tokenDisplay: `#${order.token_no}`,
      receiptNumber: order.receipt_number ?? null,
      subtotalPaise: Number(order.subtotal_paise ?? order.total_paise),
      cgstPaise: Number(order.cgst_paise ?? 0),
      sgstPaise: Number(order.sgst_paise ?? 0),
      taxModeSnapshot: (order.tax_mode_snapshot as VendorTaxMode) || 'unregistered',
      cancelReason: order.cancel_reason ?? null,
      editedAt: order.edited_at ?? null,
      editNote: order.edit_note ?? null,
      totalPaise: Number(order.total_paise),
      totalRupees: Number(order.total_paise) / 100,
      paymentMethod: order.payment_method,
      cashPaise: pay.cashPaise,
      upiPaise: pay.upiPaise,
      paymentStatus: order.payment_status,
      orderStatus: order.order_status,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      orderType: normalizeOrderType(order.order_type, order.notes),
      notes: order.notes,
      source: order.source,
      items: items.map((i) => ({
        id: i.id,
        menuItemId: i.menu_item_id,
        itemName: i.item_name,
        quantity: i.quantity,
        unitPricePaise: Number(i.unit_price_paise),
        lineTotalPaise: Number(i.line_total_paise),
        notes: i.notes,
      })),
      createdAt: order.created_at,
      updatedAt: order.updated_at,
    };
  }

  /**
   * Order history for the stall with IST date range, status, paymentMode, search, pagination & totals
   */
  static async getOrderHistory(
    db: Kysely<Database>,
    vendorId: string,
    options?: {
      limit?: number;
      offset?: number;
      status?: string;
      paymentMethod?: string;
      paymentMode?: string;
      dateFrom?: string;
      dateTo?: string;
      search?: string;
    },
  ) {
    let query = db
      .selectFrom('orders')
      .selectAll()
      .where('vendor_id', '=', vendorId);

    if (options?.status) {
      query = query.where('order_status', '=', options.status as any);
    }

    const modeFilter = options?.paymentMode || options?.paymentMethod;
    if (modeFilter) {
      query = query.where('payment_method', '=', modeFilter as any);
    }

    const rawOrders = await query
      .orderBy('created_at', 'desc')
      .execute();

    // Filter IST date range cleanly across both PG and in-memory DB
    let filteredOrders = rawOrders;
    if (options?.dateFrom || options?.dateTo) {
      filteredOrders = filteredOrders.filter((o) => {
        const istDate = getIstDateString(o.created_at);
        if (options.dateFrom && istDate < options.dateFrom) return false;
        if (options.dateTo && istDate > options.dateTo) return false;
        return true;
      });
    }

    // Fetch order items for search matching & line-item previews
    const filteredIds = filteredOrders.map((o) => o.id);
    const itemsByOrderId = new Map<string, any[]>();
    if (filteredIds.length > 0) {
      const orderItems = await db
        .selectFrom('order_items')
        .selectAll()
        .where('order_id', 'in', filteredIds)
        .execute();

      for (const item of orderItems) {
        if (!itemsByOrderId.has(item.order_id)) {
          itemsByOrderId.set(item.order_id, []);
        }
        itemsByOrderId.get(item.order_id)!.push({
          id: item.id,
          menuItemId: item.menu_item_id,
          itemName: item.item_name,
          quantity: item.quantity,
          unitPricePaise: Number(item.unit_price_paise),
          lineTotalPaise: Number(item.line_total_paise),
          notes: item.notes,
        });
      }
    }

    const rawSearch = options?.search?.trim().toLowerCase() || '';
    if (rawSearch) {
      const strippedHash = rawSearch.startsWith('#') ? rawSearch.slice(1) : rawSearch;
      filteredOrders = filteredOrders.filter((o) => {
        const tokenStr = String(o.token_no);
        if (tokenStr === strippedHash || `#${tokenStr}` === rawSearch) return true;
        if (o.receipt_number && String(o.receipt_number).toLowerCase().includes(rawSearch)) return true;
        const orderItems = itemsByOrderId.get(o.id) || [];
        return orderItems.some((it) => String(it.itemName || '').toLowerCase().includes(rawSearch));
      });
    }

    let netSalesPaise = 0;
    let cashPaise = 0;
    let upiPaise = 0;
    let orderCount = 0;
    let voidCount = 0;

    for (const o of filteredOrders) {
      if (o.order_status === 'cancelled') {
        voidCount++;
        continue;
      }
      orderCount++;
      netSalesPaise += Number(o.total_paise || 0);
      const pay = resolveOrderPaymentAmounts(o);
      cashPaise += pay.cashPaise;
      upiPaise += pay.upiPaise;
    }

    const limit = Math.min(options?.limit || 50, 100);
    const offset = options?.offset || 0;
    const paged = filteredOrders.slice(offset, offset + limit);

    return {
      count: paged.length,
      totalMatched: filteredOrders.length,
      summary: {
        netSalesPaise,
        cashPaise,
        upiPaise,
        orderCount,
        voidCount,
      },
      orders: paged.map((o) => {
        const pay = resolveOrderPaymentAmounts(o);
        return {
          id: o.id,
          tokenNo: o.token_no,
          tokenDisplay: `#${o.token_no}`,
          receiptNumber: o.receipt_number ?? null,
          subtotalPaise: Number(o.subtotal_paise ?? o.total_paise),
          cgstPaise: Number(o.cgst_paise ?? 0),
          sgstPaise: Number(o.sgst_paise ?? 0),
          taxModeSnapshot: (o.tax_mode_snapshot as VendorTaxMode) || 'unregistered',
          cancelReason: o.cancel_reason ?? null,
          editedAt: o.edited_at ?? null,
          editNote: o.edit_note ?? null,
          totalPaise: Number(o.total_paise),
          totalRupees: Number(o.total_paise) / 100,
          paymentMethod: o.payment_method,
          cashPaise: pay.cashPaise,
          upiPaise: pay.upiPaise,
          paymentStatus: o.payment_status,
          orderStatus: o.order_status,
          orderType: normalizeOrderType(o.order_type, o.notes),
          customerName: o.customer_name,
          notes: o.notes,
          items: itemsByOrderId.get(o.id) || [],
          createdAt: o.created_at,
        };
      }),
    };
  }
}
