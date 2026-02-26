import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

/**
 * Guard that enforces JWT-based authentication on protected routes.
 * Extends the default Passport JWT AuthGuard with logging on failures.
 *
 * Usage:
 *   @UseGuards(JwtAuthGuard)
 *   @Get('protected')
 *   handler() { ... }
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    @InjectPinoLogger(JwtAuthGuard.name) private readonly logger: PinoLogger,
  ) {
    super();
  }

  handleRequest<TUser>(
    err: Error | null,
    user: TUser | false,
    info: Error | undefined,
    context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      const request = context.switchToHttp().getRequest();
      const path = request.url;
      const method = request.method;
      const ip = request.ip;

      this.logger.warn(
        { method, path, ip, error: info?.message || err?.message },
        'Authentication failed',
      );

      throw err || new UnauthorizedException(info?.message || 'Unauthorized');
    }

    return user;
  }
}
