import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { HEADERS } from '../constants/index.js';

/**
 * Global interceptor that logs every incoming request and outgoing response.
 *
 * - Generates or forwards a correlation ID for distributed tracing.
 * - Attaches the correlation ID to the response headers.
 * - Measures and logs request duration in milliseconds.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const correlationId =
      (request.headers[HEADERS.CORRELATION_ID] as string) || uuidv4();

    // Persist on the request so downstream consumers can access it
    request.headers[HEADERS.CORRELATION_ID] = correlationId;

    // Attach to response headers for client-side tracing
    response.setHeader(HEADERS.CORRELATION_ID, correlationId);

    const { method, originalUrl, headers } = request;
    const userAgent = headers['user-agent'] || 'unknown';

    this.logger.log({
      msg: `Incoming request`,
      correlationId,
      method,
      path: originalUrl,
      userAgent,
    });

    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - startTime;
          this.logger.log({
            msg: `Response sent`,
            correlationId,
            method,
            path: originalUrl,
            statusCode: response.statusCode,
            durationMs,
          });
        },
        error: () => {
          const durationMs = Date.now() - startTime;
          this.logger.log({
            msg: `Response sent (error)`,
            correlationId,
            method,
            path: originalUrl,
            statusCode: response.statusCode,
            durationMs,
          });
        },
      }),
    );
  }
}
