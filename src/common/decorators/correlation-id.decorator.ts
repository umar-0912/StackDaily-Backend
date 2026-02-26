import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { HEADERS } from '../constants/index.js';

/**
 * Parameter decorator that extracts the correlation ID from the request.
 * If no correlation ID header is present, generates a new UUID v4.
 *
 * Usage:
 *   @Get()
 *   handler(@CorrelationId() correlationId: string) { ... }
 */
export const CorrelationId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return (
      (request.headers[HEADERS.CORRELATION_ID] as string) || uuidv4()
    );
  },
);
