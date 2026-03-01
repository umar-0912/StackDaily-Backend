import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class PopulatedTopic {
  @ApiProperty({
    description: 'Topic ID',
    example: '507f1f77bcf86cd799439011',
  })
  _id: string;

  @ApiProperty({
    description: 'Topic display name',
    example: 'JavaScript',
  })
  name: string;

  @ApiProperty({
    description: 'Topic URL-friendly slug',
    example: 'javascript',
  })
  slug: string;

  @ApiPropertyOptional({
    description: 'Topic icon identifier',
    example: 'javascript-icon',
  })
  icon?: string;
}

class SubscriptionResponse {
  @ApiProperty({
    description: 'Current subscription plan',
    example: 'free',
    enum: ['free', 'pro'],
  })
  plan: string;

  @ApiProperty({
    description: 'Subscription status',
    example: 'active',
    enum: ['active', 'cancelled', 'expired'],
  })
  status: string;

  @ApiPropertyOptional({
    description: 'Subscription start date',
    example: '2026-02-01T00:00:00.000Z',
    nullable: true,
  })
  startDate: Date | null;

  @ApiPropertyOptional({
    description: 'Subscription end date',
    example: '2026-03-01T00:00:00.000Z',
    nullable: true,
  })
  endDate: Date | null;

  @ApiPropertyOptional({
    description: 'Date when subscription was cancelled',
    example: null,
    nullable: true,
  })
  cancelledAt: Date | null;
}

class StreakResponse {
  @ApiProperty({
    description: 'Current streak count in days',
    example: 5,
  })
  count: number;

  @ApiProperty({
    description: 'Date of last recorded activity',
    example: '2026-02-26T00:00:00.000Z',
    nullable: true,
  })
  lastActiveDate: Date | null;
}

export class UserResponseDto {
  @ApiProperty({
    description: 'User unique identifier',
    example: '507f1f77bcf86cd799439011',
  })
  _id: string;

  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'Username',
    example: 'johndoe123',
  })
  username: string;

  @ApiProperty({
    description: 'User role',
    example: 'user',
    enum: ['user', 'admin'],
  })
  role: string;

  @ApiProperty({
    description: 'Whether the user account is active',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Subscribed topics with populated details',
    type: [PopulatedTopic],
  })
  subscribedTopics: PopulatedTopic[];

  @ApiProperty({
    description: 'User streak information',
    type: StreakResponse,
  })
  streak: StreakResponse;

  @ApiProperty({
    description: 'User subscription information',
    type: SubscriptionResponse,
  })
  subscription: SubscriptionResponse;

  @ApiPropertyOptional({
    description: 'Firebase Cloud Messaging token',
    example: 'dGhpcyBpcyBhIHNhbXBsZSBGQ00gdG9rZW4...',
  })
  fcmToken?: string;

  @ApiProperty({
    description: 'Account creation timestamp',
    example: '2026-01-15T10:30:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last profile update timestamp',
    example: '2026-02-26T14:00:00.000Z',
  })
  updatedAt: Date;
}
