/**
 * RFC 7807 Problem Details Error Class
 * Standardized application error format for FROSE Street
 */

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  timestamp: string;
  retryAfter?: number;
  invalidParams?: Array<{ name: string; reason: string }>;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly title: string;
  public readonly code: string;
  public readonly retryAfter?: number;
  public readonly invalidParams?: Array<{ name: string; reason: string }>;

  constructor(
    statusCode: number,
    title: string,
    detail: string,
    code: string = 'INTERNAL_ERROR',
    invalidParams?: Array<{ name: string; reason: string }>,
    retryAfter?: number,
  ) {
    super(detail);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.title = title;
    this.code = code;
    this.invalidParams = invalidParams;
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toProblemDetails(): ProblemDetails {
    const details: ProblemDetails = {
      type: 'about:blank',
      title: this.title,
      status: this.statusCode,
      detail: this.message,
      code: this.code,
      timestamp: new Date().toISOString(),
    };

    if (this.retryAfter !== undefined) {
      details.retryAfter = this.retryAfter;
    }

    if (this.invalidParams && this.invalidParams.length > 0) {
      details.invalidParams = this.invalidParams;
    }

    return details;
  }

  static badRequest(detail: string, code: string = 'BAD_REQUEST', invalidParams?: Array<{ name: string; reason: string }>): AppError {
    return new AppError(400, 'Bad Request', detail, code, invalidParams);
  }

  static unauthorized(detail: string = 'Authentication required', code: string = 'UNAUTHORIZED'): AppError {
    return new AppError(401, 'Unauthorized', detail, code);
  }

  static forbidden(detail: string = 'Access denied', code: string = 'FORBIDDEN'): AppError {
    return new AppError(403, 'Forbidden', detail, code);
  }

  static notFound(detail: string = 'Resource not found', code: string = 'NOT_FOUND'): AppError {
    return new AppError(404, 'Not Found', detail, code);
  }

  static conflict(detail: string, code: string = 'CONFLICT'): AppError {
    return new AppError(409, 'Conflict', detail, code);
  }

  static rateLimited(
    detail: string = 'Too many requests, please slow down',
    code: string = 'RATE_LIMITED',
    retryAfter?: number,
  ): AppError {
    return new AppError(429, 'Too Many Requests', detail, code, undefined, retryAfter);
  }

  static internal(detail: string = 'An unexpected internal error occurred', code: string = 'INTERNAL_ERROR'): AppError {
    return new AppError(500, 'Internal Server Error', detail, code);
  }
}
