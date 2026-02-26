import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service.js';
import { SendNotificationDto } from './dto/send-notification.dto.js';
import { PaginatedNotificationHistoryDto } from './dto/notification-history.dto.js';
import { DeliveryStatsDto } from './dto/delivery-stats.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import type { UserDocument } from '../../database/schemas/user.schema.js';

@ApiTags('Notifications')
@Controller('api/v1/notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
  ) {}

  // ─── GET /api/v1/notifications/history ─────────────────────────────

  @Get('history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get notification history for current user' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Records per page (default: 20, max: 100)',
    example: 20,
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated notification history for the authenticated user',
    type: PaginatedNotificationHistoryDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getHistory(
    @CurrentUser() user: UserDocument,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationsService.getNotificationHistory(
      user._id.toString(),
      page ? parseInt(page, 10) : undefined,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  // ─── GET /api/v1/notifications/stats/:dailySelectionId ─────────────

  @Get('stats/:dailySelectionId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get delivery stats for a daily selection',
  })
  @ApiParam({
    name: 'dailySelectionId',
    type: String,
    description: 'The ID of the daily selection to retrieve stats for',
    example: '665a1f2e3b4c5d6e7f8a9b0c',
  })
  @ApiResponse({
    status: 200,
    description: 'Delivery statistics for the specified daily selection',
    type: DeliveryStatsDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin role required' })
  async getDeliveryStats(
    @Param('dailySelectionId', ParseObjectIdPipe) dailySelectionId: string,
  ) {
    return this.notificationsService.getDeliveryStats(dailySelectionId);
  }

  // ─── POST /api/v1/notifications/test ───────────────────────────────

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Send a test notification to yourself',
  })
  @ApiResponse({
    status: 200,
    description: 'Test notification sent successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'User does not have an FCM token registered',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async sendTestNotification(
    @CurrentUser() user: UserDocument,
    @Body() dto: SendNotificationDto,
  ) {

    if (!user.fcmToken) {
      return {
        success: false,
        message:
          'No FCM token registered. Please register a device token first.',
      };
    }

    const log = await this.notificationsService.sendToUser(
      user._id.toString(),
      user.fcmToken,
      {
        title: dto.title,
        body: dto.body,
        data: dto.data,
      },
    );

    return {
      success: log.status === 'sent',
      status: log.status,
      message:
        log.status === 'sent'
          ? 'Test notification sent successfully'
          : `Notification failed: ${log.error}`,
    };
  }
}
