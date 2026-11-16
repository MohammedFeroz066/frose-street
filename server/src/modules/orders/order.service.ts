import type { Kysely } from 'kysely';
import type { Database } from '../../db/types.js';
import type { StaffRole } from '../../../../shared/types/index.js';
import { AppError } from '../../errors/app-error.js';
import { WebSocketHub } from '../websocket/websocket.hub.js';

export interface CreateOrderItemInput {
  menuItemId: string;
  quantity: number;
  notes?: string;
}

export interface CreateOrderInput {
  items: CreateOrderItemInput[];
  paymentMethod: 'cash' | 'upi' | 'split';
  paymentStatus?: 'paid' | 'pending';
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  source?: 'pos' | 'qr_customer' | 'online';
}

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';

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

    // 1. Fetch vendor to manage atomic token counter and check daily rollover
    const vendor = await db
      .selectFrom('vendors')
      .selectAll()
      .where('id', '=', vendorId)
      .executeTakeFirst();

    if (!vendor) {
      throw AppError.notFound('Vendor stall not found', 'VENDOR_NOT_FOUND');
    }

    const todayDateString = new Date().toISOString().split('T')[0];
    let nextToken = 1;

    if (vendor.token_reset_date === todayDateString) {
      nextToken = (vendor.daily_token_counter || 0) + 1;
    } else {
      // Midnight date rollover: Reset counter to 1 for the new calendar day
      nextToken = 1;
    }

    // Update vendor daily token counter atomically
    await db
      .updateTable('vendors')
      .set({
        daily_token_counter: nextToken,
        token_reset_date: todayDateString,
      })
      .where('id', '=', vendorId)
      .execute();

    // 2. Validate menu items and compute integer paise totals
    const itemIds = input.items.map((i) => i.menuItemId);
    const menuItems = await db
      .selectFrom('menu_items')
      .selectAll()
      .where('vendor_id', '=', vendorId)
      .where('id', 'in', itemIds)
      .where('is_active', '=', true)
      .execute();

    const menuItemsMap = new Map(menuItems.map((m) => [m.id, m]));

    let totalPaise = 0;
    const computedLineItems: {
      menuItemId: string;
      itemName: string;
      quantity: number;
      unitPricePaise: number;
      lineTotalPaise: number;
      notes: string | null;
    }[] = [];

    for (const itemInput of input.items) {
      if (!itemInput.quantity || !Number.isInteger(itemInput.quantity) || itemInput.quantity <= 0) {
        throw AppError.badRequest(`Invalid quantity for item ${itemInput.menuItemId}`, 'INVALID_QUANTITY');
      }

      const menuItem = menuItemsMap.get(itemInput.menuItemId);
      if (!menuItem) {
        throw AppError.badRequest(`Menu item "${itemInput.menuItemId}" does not exist in stall menu`, 'ITEM_NOT_FOUND');
      }

      if (!menuItem.is_available) {
        throw AppError.badRequest(
          `Item "${menuItem.name}" is currently marked out of stock and cannot be ordered`,
          'ITEM_OUT_OF_STOCK',
        );
      }

      const unitPricePaise = Number(menuItem.price_paise);
      const lineTotalPaise = unitPricePaise * itemInput.quantity;
      totalPaise += lineTotalPaise;

      computedLineItems.push({
        menuItemId: menuItem.id,
        itemName: menuItem.name,
        quantity: itemInput.quantity,
        unitPricePaise,
        lineTotalPaise,
        notes: itemInput.notes?.trim() || null,
      });
    }

    // 3. Insert order record
    const paymentStatus = input.paymentStatus || 'paid';
    const initialStatus: OrderStatus = 'preparing';

    const order = await db
      .insertInto('orders')
      .values({
        vendor_id: vendorId,
        token_no: nextToken,
        customer_name: input.customerName?.trim() || null,
        customer_phone: input.customerPhone?.replace(/\D/g, '') || null,
        total_paise: BigInt(totalPaise),
        payment_method: input.paymentMethod,
        payment_status: paymentStatus,
        order_status: initialStatus,
        notes: input.notes?.trim() || null,
        source: input.source || 'pos',
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
      totalPaise: Number(order.total_paise),
      totalRupees: Number(order.total_paise) / 100,
      paymentMethod: order.payment_method,
      paymentStatus: order.payment_status,
      orderStatus: order.order_status,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      notes: order.notes,
      source: order.source,
      items: insertedLineItems,
      createdAt: order.created_at,
    };

    // Sub-500ms Real-Time broadcast to Kitchen Display & Packaging Station
    WebSocketHub.broadcast(vendorId, 'order:new', createdOrder);

    return createdOrder;
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
        updatedAt: new Date().toISOString(),
      };
    }

    // Role-based state transition restrictions
    if (newStatus === 'cancelled' && !['owner', 'cashier'].includes(userRole)) {
      throw AppError.forbidden('Only cashier or owner can cancel an order', 'CANCEL_FORBIDDEN');
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

    await db
      .updateTable('orders')
      .set({
        order_status: newStatus,
        updated_at: new Date(),
      })
      .where('id', '=', orderId)
      .where('vendor_id', '=', vendorId)
      .execute();

    const result = {
      id: order.id,
      tokenNo: order.token_no,
      previousStatus: currentStatus,
      newStatus,
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

    const formattedOrders = orders.map((o) => ({
      id: o.id,
      tokenNo: o.token_no,
      tokenDisplay: `#${o.token_no}`,
      totalPaise: Number(o.total_paise),
      totalRupees: Number(o.total_paise) / 100,
      paymentMethod: o.payment_method,
      orderStatus: o.order_status,
      customerName: o.customer_name,
      notes: o.notes,
      items: itemsByOrderId.get(o.id) || [],
      createdAt: o.created_at,
    }));

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

    return {
      id: order.id,
      vendorId: order.vendor_id,
      tokenNo: order.token_no,
      tokenDisplay: `#${order.token_no}`,
      totalPaise: Number(order.total_paise),
      totalRupees: Number(order.total_paise) / 100,
      paymentMethod: order.payment_method,
      paymentStatus: order.payment_status,
      orderStatus: order.order_status,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
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
   * Order history for the stall with optional date and status filters
   */
  static async getOrderHistory(
    db: Kysely<Database>,
    vendorId: string,
    options?: { limit?: number; offset?: number; status?: string; paymentMethod?: string },
  ) {
    let query = db
      .selectFrom('orders')
      .selectAll()
      .where('vendor_id', '=', vendorId);

    if (options?.status) {
      query = query.where('order_status', '=', options.status as any);
    }

    if (options?.paymentMethod) {
      query = query.where('payment_method', '=', options.paymentMethod as any);
    }

    const limit = Math.min(options?.limit || 50, 100);
    const offset = options?.offset || 0;

    const orders = await query
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    return {
      count: orders.length,
      orders: orders.map((o) => ({
        id: o.id,
        tokenNo: o.token_no,
        tokenDisplay: `#${o.token_no}`,
        totalPaise: Number(o.total_paise),
        totalRupees: Number(o.total_paise) / 100,
        paymentMethod: o.payment_method,
        paymentStatus: o.payment_status,
        orderStatus: o.order_status,
        customerName: o.customer_name,
        createdAt: o.created_at,
      })),
    };
  }
}
