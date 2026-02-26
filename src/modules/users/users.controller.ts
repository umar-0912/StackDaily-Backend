import {
  Controller,
  Get,
  Patch,
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
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { UpdateSubscriptionsDto } from './dto/update-subscriptions.dto.js';
import { UpdateFcmTokenDto } from './dto/update-fcm-token.dto.js';
import { UserResponseDto } from './dto/user-response.dto.js';

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('api/v1/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ──────────────────────────── Get Profile ──────────────────────────────────

  @Get('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get current user profile',
    description:
      'Returns the authenticated user profile with populated subscribed topics including topic name, slug, and icon.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User profile retrieved successfully',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Not authenticated or token expired',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'User not found',
  })
  async getProfile(@CurrentUser('_id') userId: string): Promise<UserResponseDto> {
    const user = await this.usersService.getProfile(userId.toString());
    return user as unknown as UserResponseDto;
  }

  // ──────────────────────── Update Profile ───────────────────────────────────

  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update current user profile',
    description:
      'Partially updates the authenticated user profile. Only provided fields are updated. Email and username uniqueness is enforced.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Profile updated successfully',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Not authenticated or token expired',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Email or username already taken',
  })
  async updateProfile(
    @CurrentUser('_id') userId: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.updateProfile(userId.toString(), dto);
    return user as unknown as UserResponseDto;
  }

  // ─────────────────── Update Subscriptions ──────────────────────────────────

  @Patch('subscriptions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update topic subscriptions',
    description:
      'Replaces the current topic subscriptions with the provided list. All topic IDs must be valid and exist in the database.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Subscriptions updated successfully',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'One or more topic IDs are invalid or do not exist',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Not authenticated or token expired',
  })
  async updateSubscriptions(
    @CurrentUser('_id') userId: string,
    @Body() dto: UpdateSubscriptionsDto,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.updateSubscriptions(userId.toString(), dto);
    return user as unknown as UserResponseDto;
  }

  // ─────────────────── Update FCM Token ──────────────────────────────────────

  @Patch('fcm-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Update FCM device token',
    description:
      'Sets or updates the Firebase Cloud Messaging token for the authenticated user. Used to receive push notifications.',
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'FCM token updated successfully',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed (empty token)',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Not authenticated or token expired',
  })
  async updateFcmToken(
    @CurrentUser('_id') userId: string,
    @Body() dto: UpdateFcmTokenDto,
  ): Promise<void> {
    await this.usersService.updateFcmToken(userId.toString(), dto);
  }
}
