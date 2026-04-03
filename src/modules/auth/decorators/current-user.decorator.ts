import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Parameter decorator that extracts the authenticated user from the request.
 * Requires JwtAuthGuard to be applied on the route.
 *
 * Usage:
 *   @Get('profile')
 *   getProfile(@CurrentUser() user: UserDocument) { ... }
 *
 *   // Extract a specific property:
 *   @Get('profile')
 *   getProfile(@CurrentUser('_id') userId: string) { ... }
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);
