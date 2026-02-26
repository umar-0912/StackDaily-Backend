import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Decorator that attaches required roles to a route handler.
 * Used in conjunction with RolesGuard to enforce role-based access control.
 *
 * Usage:
 *   @Roles('admin')
 *   @Post()
 *   create() { ... }
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
