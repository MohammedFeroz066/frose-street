import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../errors/app-error.js';

export function errorHandler(error: FastifyError | AppError | Error, request: FastifyRequest, reply: FastifyReply) {
  // If it's our own AppError
  if (error instanceof AppError) {
    if (error.retryAfter) {
      reply.header('retry-after', error.retryAfter);
    }
    return reply.status(error.statusCode).send(error.toProblemDetails());
  }

  // Fastify Schema Validation Error
  const fastifyError = error as FastifyError;
  if (fastifyError.validation) {
    const invalidParams = fastifyError.validation.map((v) => ({
      name: v.instancePath || v.params?.missingProperty?.toString() || 'unknown',
      reason: v.message || 'Validation failed',
    }));

    const appError = AppError.badRequest('Request payload validation failed', 'VALIDATION_FAILED', invalidParams);
    return reply.status(400).send(appError.toProblemDetails());
  }

  // Fastify 429 Rate Limit Error
  if (
    (error as any).statusCode === 429 ||
    (error as any).code === 'FST_ERR_RATE_LIMIT_EXCEEDED' ||
    error.message?.includes('Rate limit exceeded')
  ) {
    const appError = AppError.rateLimited('Rate limit exceeded. Maximum 100 requests per minute allowed.');
    return reply.status(429).send(appError.toProblemDetails());
  }

  // Generic Unhandled Internal Error
  request.log?.error(error, 'Unhandled Exception in Fastify Request Pipeline');
  const internalError = AppError.internal(
    process.env.NODE_ENV === 'production' ? 'An unexpected server error occurred' : error.message,
  );
  return reply.status(500).send(internalError.toProblemDetails());
}

export function notFoundHandler(request: FastifyRequest, reply: FastifyReply) {
  const notFound = AppError.notFound(`Cannot ${request.method} ${request.url}`);
  return reply.status(404).send(notFound.toProblemDetails());
}
