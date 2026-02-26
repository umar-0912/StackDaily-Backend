import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { HEADERS, ERROR_MESSAGES } from '../constants/index.js';

interface ErrorResponseBody {
  statusCode: number;
  errorCode: string;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
  correlationId: string;
}

const STATUS_TO_ERROR_CODE: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_SERVER_ERROR',
};

/**
 * Global exception filter that catches all exceptions and returns
 * a consistent error response format across the entire application.
 *
 * - HttpExceptions are forwarded with their original status and message.
 * - Unknown exceptions are treated as 500 Internal Server Error.
 * - 5xx errors include the stack trace in logs for debugging.
 * - A correlation ID is attached for distributed tracing.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const correlationId =
      (request.headers[HEADERS.CORRELATION_ID] as string) || uuidv4();

    const { statusCode, message, error } = this.extractErrorInfo(exception);

    const errorResponse: ErrorResponseBody = {
      statusCode,
      errorCode:
        STATUS_TO_ERROR_CODE[statusCode] ||
        `ERROR_${statusCode}`,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
      correlationId,
    };

    // Log context shared across all error levels
    const logContext = {
      correlationId,
      statusCode,
      method: request.method,
      path: request.url,
      message,
    };

    if (statusCode >= 500) {
      this.logger.error(
        {
          ...logContext,
          stack:
            exception instanceof Error ? exception.stack : undefined,
        },
        `Server error on ${request.method} ${request.url}`,
      );
    } else {
      this.logger.warn(
        logContext,
        `Client error on ${request.method} ${request.url}`,
      );
    }

    response.status(statusCode).json(errorResponse);
  }

  private extractErrorInfo(exception: unknown): {
    statusCode: number;
    message: string | string[];
    error: string;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        return {
          statusCode: status,
          message: exceptionResponse,
          error: HttpStatus[status] || 'Error',
        };
      }

      const responseObj = exceptionResponse as Record<string, unknown>;
      return {
        statusCode: status,
        message:
          (responseObj.message as string | string[]) ||
          exception.message,
        error:
          (responseObj.error as string) || HttpStatus[status] || 'Error',
      };
    }

    // Unknown / unhandled exceptions
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
    };
  }
}
