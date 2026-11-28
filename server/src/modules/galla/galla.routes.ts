import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { GallaService } from './galla.service.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validateSchema } from '../auth/auth.schemas.js';
import { withTenantContext } from '../../db/rls-context.js';
import { AppError } from '../../errors/app-error.js';
import { getIstDateString } from '../../utils/ist-date.js';

const LogExpenseSchema = z.object({
  amountPaise: z.union([z.number(), z.bigint()]).optional(),
  amount_paise: z.union([z.number(), z.bigint()]).optional(),
  description: z.string().max(250).optional(),
  title: z.string().max(250).optional(),
  category: z.string().max(80).optional(),
  paymentMethod: z.enum(['cash', 'upi']).optional(),
  payment_method: z.enum(['cash', 'upi']).optional(),
  expenseDate: z.string().max(32).optional(),
  expense_date: z.string().max(32).optional(),
}).strict();

const DateQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

const ExpenseIdParamSchema = z.object({ id: z.string().min(1).max(100) }).strict();

const CloseDayBodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(300).optional(),
  countedCashPaise: z.number().int().nonnegative().optional(),
}).strict();

const PaginationQuerySchema = z.object({
  limit: z.string().regex(/^\d+$/).optional(),
  offset: z.string().regex(/^\d+$/).optional(),
}).strict();

const ExportDateRangeSchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

function resolveExportDateRange(query: { dateFrom?: string; dateTo?: string }): { dateFrom: string; dateTo: string } {
  const today = getIstDateString();
  const dateFrom = query.dateFrom || today;
  const dateTo = query.dateTo || query.dateFrom || today;

  const start = new Date(`${dateFrom}T00:00:00.000+05:30`);
  const end = new Date(`${dateTo}T00:00:00.000+05:30`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw AppError.badRequest('Invalid IST date parameter', 'INVALID_DATE_FORMAT');
  }
  if (dateFrom > dateTo) {
    throw AppError.badRequest('dateFrom cannot be after dateTo', 'INVALID_DATE_RANGE');
  }
  return { dateFrom, dateTo };
}

export const gallaRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  /**
   * POST /api/v1/galla/expenses
   * Logs a petty cash or digital expense (Owner & Cashier only)
   */
  app.post(
    '/expenses',
    { preHandler: [requireAuth, requireRole('owner', 'cashier')] },
    async (request, reply) => {
      const body = validateSchema(LogExpenseSchema, request.body);

      const amountPaise = body.amountPaise ?? body.amount_paise;
      if (amountPaise === undefined) {
        throw AppError.badRequest('Expense amount must be a valid integer in paise', 'INVALID_INTEGER_PAISE');
      }

      const expense = await withTenantContext(request.user!.sub, (db) =>
        GallaService.logExpense(db, request.user!.sub, {
          amountPaise,
          description: body.description ?? body.title,
          category: body.category,
          paymentMethod: body.paymentMethod ?? body.payment_method,
          expenseDate: body.expenseDate ?? body.expense_date,
        }),
      );

      return reply.status(201).send({
        status: 'success',
        message: 'Expense logged successfully',
        expense,
      });
    },
  );

  /**
   * GET /api/v1/galla/expenses
   * Lists expenses for a specific date (defaults to today)
   */
  app.get(
    '/expenses',
    { preHandler: [requireAuth, requireRole('owner', 'cashier')] },
    async (request, reply) => {
      const query = validateSchema(DateQuerySchema, request.query || {});

      const result = await withTenantContext(request.user!.sub, (db) =>
        GallaService.getExpenses(db, request.user!.sub, query.date),
      );

      return reply.status(200).send({
        status: 'success',
        ...result,
      });
    },
  );

  /**
   * DELETE /api/v1/galla/expenses/:id
   * Removes an expense record (Owner & Cashier only)
   */
  app.delete(
    '/expenses/:id',
    { preHandler: [requireAuth, requireRole('owner', 'cashier')] },
    async (request, reply) => {
      const params = validateSchema(ExpenseIdParamSchema, request.params);

      const result = await withTenantContext(request.user!.sub, (db) =>
        GallaService.deleteExpense(db, request.user!.sub, params.id),
      );

      return reply.status(200).send({
        status: 'success',
        ...result,
      });
    },
  );

  /**
   * GET /api/v1/galla/summary
   * Returns live Galla cash vs UPI tally, drawer balance, and net profit
   */
  app.get(
    '/summary',
    { preHandler: [requireAuth, requireRole('owner', 'cashier')] },
    async (request, reply) => {
      const query = validateSchema(DateQuerySchema, request.query || {});

      const summary = await withTenantContext(request.user!.sub, (db) =>
        GallaService.getGallaSummary(db, request.user!.sub, query.date),
      );

      return reply.status(200).send({
        status: 'success',
        summary,
      });
    },
  );

  /**
   * POST /api/v1/galla/close-day
   * Closes the fiscal day and generates sealed Z-Report (Owner only)
   */
  app.post(
    '/close-day',
    { preHandler: [requireAuth, requireRole('owner')] },
    async (request, reply) => {
      const body = validateSchema(CloseDayBodySchema, request.body || {});

      const result = await withTenantContext(request.user!.sub, (db) =>
        GallaService.closeFiscalDay(db, request.user!.sub, body),
      );

      return reply.status(200).send({
        status: 'success',
        message: 'Fiscal day closed and Z-Report generated successfully',
        ...result,
      });
    },
  );

  /**
   * POST /api/v1/galla/z-report
   * Alias for /close-day (Owner only)
   */
  app.post(
    '/z-report',
    { preHandler: [requireAuth, requireRole('owner')] },
    async (request, reply) => {
      const body = validateSchema(CloseDayBodySchema, request.body || {});

      const result = await withTenantContext(request.user!.sub, (db) =>
        GallaService.closeFiscalDay(db, request.user!.sub, body),
      );

      return reply.status(200).send({
        status: 'success',
        message: 'Fiscal day closed and Z-Report generated successfully',
        ...result,
      });
    },
  );

  /**
   * GET /api/v1/galla/z-reports
   * Retrieves past closed Z-reports (Owner only)
   */
  app.get(
    '/z-reports',
    { preHandler: [requireAuth, requireRole('owner')] },
    async (request, reply) => {
      const query = validateSchema(PaginationQuerySchema, request.query || {});

      const limit = query.limit ? parseInt(query.limit, 10) : 30;
      const offset = query.offset ? parseInt(query.offset, 10) : 0;

      const summaries = await withTenantContext(request.user!.sub, (db) =>
        GallaService.getHistoricalSummaries(db, request.user!.sub, {
          limit,
          offset,
        }),
      );

      return reply.status(200).send({
        status: 'success',
        summaries,
      });
    },
  );

  /**
   * GET /api/v1/galla/history
   * Alias for /z-reports (Owner only)
   */
  app.get(
    '/history',
    { preHandler: [requireAuth, requireRole('owner')] },
    async (request, reply) => {
      const query = validateSchema(PaginationQuerySchema, request.query || {});

      const limit = query.limit ? parseInt(query.limit, 10) : 30;
      const offset = query.offset ? parseInt(query.offset, 10) : 0;

      const summaries = await withTenantContext(request.user!.sub, (db) =>
        GallaService.getHistoricalSummaries(db, request.user!.sub, {
          limit,
          offset,
        }),
      );

      return reply.status(200).send({
        status: 'success',
        summaries,
      });
    },
  );

  /**
   * GET /api/v1/galla/export/sales.csv
   * CA-ready GSTR-1 / Monthly Sales Register CSV export (Owner & Cashier)
   */
  app.get(
    '/export/sales.csv',
    { preHandler: [requireAuth, requireRole('owner', 'cashier')] },
    async (request, reply) => {
      const query = validateSchema(ExportDateRangeSchema, request.query || {});
      const { dateFrom, dateTo } = resolveExportDateRange(query);

      const csv = await withTenantContext(request.user!.sub, (db) =>
        GallaService.exportSalesCsv(db, request.user!.sub, dateFrom, dateTo),
      );

      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="frose-sales-${dateTo}.csv"`);
      return reply.status(200).send(csv);
    },
  );

  /**
   * GET /api/v1/galla/export/expenses.csv
   * Daily Expenses & Cash-Out Register CSV export (Owner & Cashier)
   */
  app.get(
    '/export/expenses.csv',
    { preHandler: [requireAuth, requireRole('owner', 'cashier')] },
    async (request, reply) => {
      const query = validateSchema(ExportDateRangeSchema, request.query || {});
      const { dateFrom, dateTo } = resolveExportDateRange(query);

      const csv = await withTenantContext(request.user!.sub, (db) =>
        GallaService.exportExpensesCsv(db, request.user!.sub, dateFrom, dateTo),
      );

      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="frose-expenses-${dateTo}.csv"`);
      return reply.status(200).send(csv);
    },
  );
};
