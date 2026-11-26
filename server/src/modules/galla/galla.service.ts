import type { Kysely } from 'kysely';
import type { Database } from '../../db/types.js';
import type { Expense, GallaSummary, DailySummary } from '../../../../shared/types/index.js';
import { AppError } from '../../errors/app-error.js';
import { WebSocketHub } from '../websocket/websocket.hub.js';
import { getIstDateString } from '../../utils/ist-date.js';

export interface LogExpenseInput {
  amountPaise: number | bigint;
  description?: string;
  title?: string;
  category?: string;
  paymentMethod?: 'cash' | 'upi';
  expenseDate?: string;
}

export class GallaService {
  /**
   * Logs a new petty cash or digital expense with strict integer paise validation
   */
  static async logExpense(
    db: Kysely<Database>,
    vendorId: string,
    input: LogExpenseInput,
  ): Promise<Expense> {
    const rawAmount = input.amountPaise;

    // Strict Integer Paise Validation (No floats, no decimals, strictly > 0)
    if (typeof rawAmount !== 'number' && typeof rawAmount !== 'bigint') {
      throw AppError.badRequest(
        'Expense amount must be a valid integer in paise',
        'INVALID_INTEGER_PAISE',
      );
    }

    if (typeof rawAmount === 'number') {
      if (!Number.isInteger(rawAmount)) {
        throw AppError.badRequest(
          'Floating point amounts are forbidden. All financial calculations must strictly use integer paise',
          'FLOATS_FORBIDDEN',
        );
      }
      if (rawAmount <= 0) {
        throw AppError.badRequest(
          'Expense amount must be strictly greater than 0 paise',
          'INVALID_EXPENSE_AMOUNT',
        );
      }
    } else if (rawAmount <= 0n) {
      throw AppError.badRequest(
        'Expense amount must be strictly greater than 0 paise',
        'INVALID_EXPENSE_AMOUNT',
      );
    }

    const description = (input.description || input.title || '').trim();
    if (!description || description.length > 200) {
      throw AppError.badRequest(
        'Expense description is required and must be between 1 and 200 characters',
        'INVALID_DESCRIPTION',
      );
    }

    const category = (input.category || 'general').trim().toLowerCase().slice(0, 50);
    const paymentMethod: 'cash' | 'upi' = input.paymentMethod === 'upi' ? 'upi' : 'cash';

    const todayDateString = getIstDateString();
    const expenseDate = input.expenseDate || todayDateString;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
      throw AppError.badRequest(
        'Invalid expense date format. Required format: YYYY-MM-DD',
        'INVALID_DATE_FORMAT',
      );
    }

    const amountPaiseInt = typeof rawAmount === 'bigint' ? rawAmount : BigInt(rawAmount);

    const inserted = await db
      .insertInto('expenses')
      .values({
        vendor_id: vendorId,
        amount_paise: amountPaiseInt,
        description,
        category,
        payment_method: paymentMethod,
        expense_date: expenseDate,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const createdExpense: Expense = {
      id: inserted.id,
      vendorId: inserted.vendor_id,
      amountPaise: Number(inserted.amount_paise),
      amountRupees: Number(inserted.amount_paise) / 100,
      description: inserted.description,
      title: inserted.description,
      category: (inserted.category as string) || 'general',
      paymentMethod: (inserted.payment_method as 'cash' | 'upi') || 'cash',
      expenseDate: String(inserted.expense_date),
      createdAt: new Date(inserted.created_at).toISOString(),
    };

    // Broadcast real-time event to owner/cashier terminals
    WebSocketHub.broadcast(
      vendorId,
      'galla:expense_created',
      {
        expenseId: createdExpense.id,
        amountPaise: createdExpense.amountPaise,
        amountRupees: createdExpense.amountRupees,
        description: createdExpense.description,
        category: createdExpense.category,
        paymentMethod: createdExpense.paymentMethod,
        expenseDate: createdExpense.expenseDate,
      },
      ['owner', 'cashier'],
    );

    return createdExpense;
  }

  /**
   * Retrieves all expenses for a given stall and date
   */
  static async getExpenses(
    db: Kysely<Database>,
    vendorId: string,
    date?: string,
  ): Promise<{
    expenses: Expense[];
    totalExpensesPaise: number;
    totalExpensesRupees: number;
  }> {
    const targetDate = date || getIstDateString();

    const rows = await db
      .selectFrom('expenses')
      .selectAll()
      .where('vendor_id', '=', vendorId)
      .where('expense_date', '=', targetDate)
      .orderBy('created_at', 'desc')
      .execute();

    let totalExpensesPaise = 0;
    const expenses: Expense[] = rows.map((r) => {
      const amountPaise = Number(r.amount_paise);
      totalExpensesPaise += amountPaise;
      return {
        id: r.id,
        vendorId: r.vendor_id,
        amountPaise,
        amountRupees: amountPaise / 100,
        description: r.description,
        title: r.description,
        category: (r.category as string) || 'general',
        paymentMethod: (r.payment_method as 'cash' | 'upi') || 'cash',
        expenseDate: String(r.expense_date),
        createdAt: new Date(r.created_at).toISOString(),
      };
    });

    return {
      expenses,
      totalExpensesPaise,
      totalExpensesRupees: totalExpensesPaise / 100,
    };
  }

  /**
   * Deletes an expense by ID
   */
  static async deleteExpense(
    db: Kysely<Database>,
    vendorId: string,
    expenseId: string,
  ): Promise<{ success: boolean; message: string }> {
    const existing = await db
      .selectFrom('expenses')
      .selectAll()
      .where('id', '=', expenseId)
      .where('vendor_id', '=', vendorId)
      .executeTakeFirst();

    if (!existing) {
      throw AppError.notFound('Expense record not found', 'EXPENSE_NOT_FOUND');
    }

    await db
      .deleteFrom('expenses')
      .where('id', '=', expenseId)
      .where('vendor_id', '=', vendorId)
      .execute();

    // Broadcast deletion to owner/cashier
    WebSocketHub.broadcast(
      vendorId,
      'galla:expense_deleted',
      { expenseId },
      ['owner', 'cashier'],
    );

    return {
      success: true,
      message: 'Expense deleted successfully',
    };
  }

  /**
   * Computes real-time Galla cash vs UPI breakdown, drawer balance, and net profit
   */
  static async getGallaSummary(
    db: Kysely<Database>,
    vendorId: string,
    date?: string,
  ): Promise<GallaSummary> {
    const targetDate = date || getIstDateString();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      throw AppError.badRequest(
        'Invalid summary date format. Required format: YYYY-MM-DD',
        'INVALID_DATE_FORMAT',
      );
    }

    // 1. Fetch vendor orders
    const allOrders = await db
      .selectFrom('orders')
      .selectAll()
      .where('vendor_id', '=', vendorId)
      .execute();

    // Filter orders belonging to target IST business date
    const dateOrders = allOrders.filter((o) => {
      const orderDateStr = getIstDateString(o.created_at);
      return orderDateStr === targetDate;
    });

    const paidOrders = dateOrders.filter(
      (o) => o.payment_status === 'paid' && o.order_status !== 'cancelled',
    );
    const cancelledOrders = dateOrders.filter((o) => o.order_status === 'cancelled').length;

    let totalSalesPaise = 0;
    let cashSalesPaise = 0;
    let upiSalesPaise = 0;

    for (const order of paidOrders) {
      const amount = Number(order.total_paise);
      totalSalesPaise += amount;
      if (order.payment_method === 'cash') {
        cashSalesPaise += amount;
      } else if (order.payment_method === 'upi') {
        upiSalesPaise += amount;
      }
    }

    // 2. Fetch expenses for target date
    const expenses = await db
      .selectFrom('expenses')
      .selectAll()
      .where('vendor_id', '=', vendorId)
      .where('expense_date', '=', targetDate)
      .execute();

    let totalExpensesPaise = 0;
    let cashExpensesPaise = 0;
    let upiExpensesPaise = 0;

    for (const exp of expenses) {
      const amount = Number(exp.amount_paise);
      totalExpensesPaise += amount;
      const method = (exp.payment_method as string) || 'cash';
      if (method === 'cash') {
        cashExpensesPaise += amount;
      } else {
        upiExpensesPaise += amount;
      }
    }

    // 3. Mathematical Balances
    // Cash physically in Galla drawer = Cash sales collected - Cash paid out for expenses
    const cashInDrawerPaise = cashSalesPaise - cashExpensesPaise;
    // Total Net profit = Total sales (cash + upi) - Total expenses
    const netProfitPaise = totalSalesPaise - totalExpensesPaise;

    // 4. Determine Top Selling Item
    let topSellingItem: string | null = null;
    if (paidOrders.length > 0) {
      const paidOrderIds = paidOrders.map((o) => o.id);
      const items = await db
        .selectFrom('order_items')
        .selectAll()
        .where('order_id', 'in', paidOrderIds)
        .execute();

      const itemCounts: Record<string, number> = {};
      for (const it of items) {
        itemCounts[it.item_name] = (itemCounts[it.item_name] || 0) + it.quantity;
      }

      let maxQty = 0;
      for (const [name, qty] of Object.entries(itemCounts)) {
        if (qty > maxQty) {
          maxQty = qty;
          topSellingItem = name;
        }
      }
    }

    // 5. Check if fiscal day is already closed in daily_summaries
    const closedSummary = await db
      .selectFrom('daily_summaries')
      .selectAll()
      .where('vendor_id', '=', vendorId)
      .where('summary_date', '=', targetDate)
      .executeTakeFirst();

    return {
      summaryDate: targetDate,
      totalOrders: paidOrders.length,
      cancelledOrders,
      totalSalesPaise,
      cashSalesPaise,
      upiSalesPaise,
      totalExpensesPaise,
      cashExpensesPaise,
      upiExpensesPaise,
      cashInDrawerPaise,
      netProfitPaise,
      topSellingItem,
      totalSalesRupees: totalSalesPaise / 100,
      cashSalesRupees: cashSalesPaise / 100,
      upiSalesRupees: upiSalesPaise / 100,
      totalExpensesRupees: totalExpensesPaise / 100,
      cashInDrawerRupees: cashInDrawerPaise / 100,
      netProfitRupees: netProfitPaise / 100,
      isDayClosed: !!closedSummary,
    };
  }

  /**
   * Closes the fiscal business day, saves a permanent Z-Report snapshot into daily_summaries,
   * and generates ready-to-share WhatsApp summary text
   */
  static async closeFiscalDay(
    db: Kysely<Database>,
    vendorId: string,
    input?: { date?: string; notes?: string },
  ): Promise<{
    success: boolean;
    summary: DailySummary;
    zReportText: string;
  }> {
    const targetDate = input?.date || getIstDateString();

    // Compute live balances
    const live = await this.getGallaSummary(db, vendorId, targetDate);

    // Fetch vendor business name
    const vendor = await db
      .selectFrom('vendors')
      .select(['business_name', 'owner_name'])
      .where('id', '=', vendorId)
      .executeTakeFirst();

    const businessName = vendor?.business_name || 'FROSE Street Stall';

    // Check if daily summary already exists
    const existing = await db
      .selectFrom('daily_summaries')
      .selectAll()
      .where('vendor_id', '=', vendorId)
      .where('summary_date', '=', targetDate)
      .executeTakeFirst();

    let savedSummary: any;

    if (existing) {
      // Update existing day record
      savedSummary = await db
        .updateTable('daily_summaries')
        .set({
          total_orders: live.totalOrders,
          total_sales_paise: BigInt(live.totalSalesPaise),
          cash_sales_paise: BigInt(live.cashSalesPaise),
          upi_sales_paise: BigInt(live.upiSalesPaise),
          total_expenses_paise: BigInt(live.totalExpensesPaise),
          net_paise: BigInt(live.netProfitPaise),
          cancelled_orders: live.cancelledOrders,
          top_selling_item: live.topSellingItem,
        })
        .where('id', '=', existing.id)
        .returningAll()
        .executeTakeFirstOrThrow();
    } else {
      // Insert new daily summary
      savedSummary = await db
        .insertInto('daily_summaries')
        .values({
          vendor_id: vendorId,
          summary_date: targetDate,
          total_orders: live.totalOrders,
          total_sales_paise: BigInt(live.totalSalesPaise),
          cash_sales_paise: BigInt(live.cashSalesPaise),
          upi_sales_paise: BigInt(live.upiSalesPaise),
          total_expenses_paise: BigInt(live.totalExpensesPaise),
          net_paise: BigInt(live.netProfitPaise),
          cancelled_orders: live.cancelledOrders,
          top_selling_item: live.topSellingItem,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    }

    const dailySummaryResult: DailySummary = {
      id: savedSummary.id,
      vendorId: savedSummary.vendor_id,
      summaryDate: String(savedSummary.summary_date),
      totalOrders: savedSummary.total_orders,
      totalSalesPaise: Number(savedSummary.total_sales_paise),
      cashSalesPaise: Number(savedSummary.cash_sales_paise),
      upiSalesPaise: Number(savedSummary.upi_sales_paise),
      totalExpensesPaise: Number(savedSummary.total_expenses_paise),
      netPaise: Number(savedSummary.net_paise),
      cancelledOrders: savedSummary.cancelled_orders,
      topSellingItem: savedSummary.top_selling_item,
      createdAt: new Date(savedSummary.created_at).toISOString(),
    };

    // Format street vendor WhatsApp / Thermal print friendly Z-Report
    const zReportText = [
      `🧾 *FROSE Street — Day-End Z-Report*`,
      `🏪 *${businessName}*`,
      `📅 Date: ${targetDate}`,
      `───────────────────────────────`,
      `💰 *Total Sales:* ₹${(live.totalSalesPaise / 100).toFixed(2)} (${live.totalOrders} orders)`,
      `   💵 Cash: ₹${(live.cashSalesPaise / 100).toFixed(2)}`,
      `   📱 UPI:  ₹${(live.upiSalesPaise / 100).toFixed(2)}`,
      `📉 *Expenses:*   ₹${(live.totalExpensesPaise / 100).toFixed(2)}`,
      `───────────────────────────────`,
      `💵 *Cash in Galla:* ₹${(live.cashInDrawerPaise / 100).toFixed(2)}`,
      `✨ *Net Profit:*    ₹${(live.netProfitPaise / 100).toFixed(2)}`,
      `🏆 *Top Dish:*      ${live.topSellingItem || 'None'}`,
      `❌ *Cancelled:*     ${live.cancelledOrders}`,
      `───────────────────────────────`,
      `⚡ *FROSE Street Micro-POS* (street.frostech.com)`,
    ].join('\n');

    // Broadcast day close event to terminals
    WebSocketHub.broadcast(
      vendorId,
      'galla:day_closed',
      {
        summaryDate: targetDate,
        totalSalesPaise: live.totalSalesPaise,
        netProfitPaise: live.netProfitPaise,
        cashInDrawerPaise: live.cashInDrawerPaise,
      },
      ['owner', 'cashier'],
    );

    return {
      success: true,
      summary: dailySummaryResult,
      zReportText,
    };
  }

  /**
   * Retrieves historical Z-reports for a stall
   */
  static async getHistoricalSummaries(
    db: Kysely<Database>,
    vendorId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<DailySummary[]> {
    const limit = options?.limit ?? 30;
    const offset = options?.offset ?? 0;

    const rows = await db
      .selectFrom('daily_summaries')
      .selectAll()
      .where('vendor_id', '=', vendorId)
      .orderBy('summary_date', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    return rows.map((r) => ({
      id: r.id,
      vendorId: r.vendor_id,
      summaryDate: String(r.summary_date),
      totalOrders: r.total_orders,
      totalSalesPaise: Number(r.total_sales_paise),
      cashSalesPaise: Number(r.cash_sales_paise),
      upiSalesPaise: Number(r.upi_sales_paise),
      totalExpensesPaise: Number(r.total_expenses_paise),
      netPaise: Number(r.net_paise),
      cancelledOrders: r.cancelled_orders,
      topSellingItem: r.top_selling_item,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }
}

