import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { GallaService } from './galla.service.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { getDatabase } from '../../db/database.js';
import { AppError } from '../../errors/app-error.js';

export const gallaRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  /**
   * POST /api/v1/galla/expenses
   * Logs a petty cash or digital expense (Owner & Cashier only)
   */
  app.post(
    '/expenses',
    { preHandler: [requireAuth, requireRole('owner', 'cashier')] },
    async (request, reply) => {
      const db = getDatabase();
      const body = request.body as any;

      if (!body) {
        throw AppError.badRequest('Expense payload is required', 'MISSING_PAYLOAD');
      }

      const amountPaise = body.amountPaise ?? body.amount_paise;
      const description = body.description ?? body.title;
      const category = body.category;
      const paymentMethod = body.paymentMethod ?? body.payment_method;
      const expenseDate = body.expenseDate ?? body.expense_date;

      const expense = await GallaService.logExpense(db, request.user!.sub, {
        amountPaise,
        description,
        category,
        paymentMethod,
        expenseDate,
      });

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
      const db = getDatabase();
      const query = (request.query || {}) as { date?: string };

      const result = await GallaService.getExpenses(db, request.user!.sub, query.date);

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
      const db = getDatabase();
      const params = request.params as { id: string };

      if (!params.id) {
        throw AppError.badRequest('Expense ID is required', 'MISSING_EXPENSE_ID');
      }

      const result = await GallaService.deleteExpense(db, request.user!.sub, params.id);

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
      const db = getDatabase();
      const query = (request.query || {}) as { date?: string };

      const summary = await GallaService.getGallaSummary(db, request.user!.sub, query.date);

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
      const db = getDatabase();
      const body = (request.body || {}) as { date?: string; notes?: string };

      const result = await GallaService.closeFiscalDay(db, request.user!.sub, body);

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
      const db = getDatabase();
      const body = (request.body || {}) as { date?: string; notes?: string };

      const result = await GallaService.closeFiscalDay(db, request.user!.sub, body);

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
      const db = getDatabase();
      const query = (request.query || {}) as { limit?: string; offset?: string };

      const limit = query.limit ? parseInt(query.limit, 10) : 30;
      const offset = query.offset ? parseInt(query.offset, 10) : 0;

      const summaries = await GallaService.getHistoricalSummaries(db, request.user!.sub, {
        limit,
        offset,
      });

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
      const db = getDatabase();
      const query = (request.query || {}) as { limit?: string; offset?: string };

      const limit = query.limit ? parseInt(query.limit, 10) : 30;
      const offset = query.offset ? parseInt(query.offset, 10) : 0;

      const summaries = await GallaService.getHistoricalSummaries(db, request.user!.sub, {
        limit,
        offset,
      });

      return reply.status(200).send({
        status: 'success',
        summaries,
      });
    },
  );
};
