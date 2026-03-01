import {
  Controller,
  Patch,
  Get,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';

import { UsersService } from './users.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AdminUpdateSubscriptionDto } from './dto/admin-update-subscription.dto.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { UserResponseDto } from './dto/user-response.dto.js';

@ApiTags('Admin - Subscriptions')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('api/v1/admin/subscriptions')
export class AdminController {
  constructor(private readonly usersService: UsersService) {}

  // ──────────────────── Update User Subscription ───────────────────────────

  @Patch(':userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update a user subscription plan (admin only)',
    description:
      'Upgrade or downgrade a user subscription. For Pro, optionally specify durationDays (default 30).',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Subscription updated successfully',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid plan or duration',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'User not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Admin access required',
  })
  async updateUserSubscription(
    @Param('userId', ParseObjectIdPipe) userId: string,
    @Body() dto: AdminUpdateSubscriptionDto,
  ) {
    return this.usersService.updateUserSubscription(
      userId,
      dto.plan,
      dto.durationDays,
    );
  }

  // ──────────────────── Subscription Statistics ────────────────────────────

  @Get('stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get subscription statistics (admin only)',
    description:
      'Returns counts of total, free, pro, and over-limit users.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Statistics retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Admin access required',
  })
  async getSubscriptionStats() {
    return this.usersService.getSubscriptionStats();
  }
}
