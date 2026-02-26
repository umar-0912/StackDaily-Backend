import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';

import { Types } from 'mongoose';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

interface AuthenticatedUser {
  _id: Types.ObjectId;
  email: string;
  role: string;
  [key: string]: unknown;
}

import { DailyFlowService } from './daily-flow.service.js';
import { DailyFeedItemDto } from './dto/daily-feed-item.dto.js';
import { DailyStatsDto } from './dto/daily-stats.dto.js';
import { DailyStatsQueryDto } from './dto/daily-stats-query.dto.js';
import { MarkReadDto } from './dto/mark-read.dto.js';

/**
 * Controller handling all daily flow endpoints:
 * - User-facing feed retrieval
 * - Content read tracking with streak management
 * - Admin statistics and manual trigger
 */
@ApiTags('Daily Flow')
@Controller('api/v1/daily')
export class DailyFlowController {
  private readonly logger = new Logger(DailyFlowController.name);

  constructor(private readonly dailyFlowService: DailyFlowService) {}

  // ──────────────────────────── GET /feed ─────────────────────────────────────

  /**
   * Retrieve today's learning feed for the authenticated user.
   * Returns one item per subscribed topic with the daily question and AI answer.
   */
  @Get('feed')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: "Get today's learning feed for current user" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Today's daily feed items for the user's subscribed topics",
    type: [DailyFeedItemDto],
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async getDailyFeed(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DailyFeedItemDto[]> {
    const userId = user._id.toString();
    this.logger.log({ msg: 'GET /api/v1/daily/feed', userId });
    return this.dailyFlowService.getDailyFeed(userId);
  }

  // ──────────────────────── POST /mark-read ──────────────────────────────────

  /**
   * Mark a daily selection as read and update the user's streak.
   */
  @Post('mark-read')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Mark daily content as read and update streak' })
  @ApiBody({ type: MarkReadDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Content marked as read and streak updated',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Daily selection or user not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async markAsRead(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MarkReadDto,
  ): Promise<{ message: string }> {
    const userId = user._id.toString();
    this.logger.log({
      msg: 'POST /api/v1/daily/mark-read',
      userId,
      dailySelectionId: dto.dailySelectionId,
    });

    await this.dailyFlowService.markAsRead(userId, dto.dailySelectionId);
    return { message: 'Streak updated' };
  }

  // ──────────────────────── GET /stats (admin) ───────────────────────────────

  /**
   * Retrieve daily flow statistics for a given date.
   * Defaults to today if no date is provided.
   */
  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get daily flow statistics' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Daily flow statistics for the requested date',
    type: DailyStatsDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Admin role required',
  })
  async getDailyStats(
    @Query() query: DailyStatsQueryDto,
  ): Promise<DailyStatsDto> {
    this.logger.log({ msg: 'GET /api/v1/daily/stats', date: query.date });
    return this.dailyFlowService.getDailyStats(query.date);
  }

  // ──────────────────── POST /trigger (admin) ────────────────────────────────

  /**
   * Manually trigger the daily flow. Intended for the ops team.
   * Returns 202 Accepted immediately; the flow runs asynchronously.
   */
  @Post('trigger')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Manually trigger the daily flow' })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'Daily flow triggered successfully',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Admin role required',
  })
  async triggerDailyFlow(): Promise<{ message: string }> {
    this.logger.log({ msg: 'POST /api/v1/daily/trigger' });

    // Fire and forget: don't await so the response returns immediately
    this.dailyFlowService.triggerDailyFlow().catch((error) => {
      this.logger.error({
        msg: 'Manual daily flow trigger failed',
        error: error.message,
        stack: error.stack,
      });
    });

    return { message: 'Daily flow triggered' };
  }
}
