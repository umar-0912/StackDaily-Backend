import { ApiProperty } from '@nestjs/swagger';

export class SubscriptionInfoDto {
  @ApiProperty({
    description: 'Current subscription plan',
    enum: ['free', 'pro'],
    example: 'free',
  })
  plan: string;

  @ApiProperty({
    description: 'Subscription status',
    enum: ['active', 'cancelled', 'expired'],
    example: 'active',
  })
  status: string;

  @ApiProperty({
    description: 'Subscription tier (null for free plan)',
    enum: ['monthly', 'half_yearly', 'yearly'],
    example: null,
    nullable: true,
  })
  tier: string | null;

  @ApiProperty({
    description: 'Human-readable tier name (null for free plan)',
    example: null,
    nullable: true,
  })
  tierName: string | null;

  @ApiProperty({
    description: 'Price per month in currency units (null for free plan)',
    example: null,
    nullable: true,
  })
  pricePerMonth: number | null;

  @ApiProperty({
    description: 'Currency code (INR for Razorpay, USD for Stripe)',
    example: 'INR',
  })
  currency: string;

  @ApiProperty({
    description: 'Payment provider used for the subscription (null for free plan)',
    enum: ['razorpay', 'stripe'],
    example: null,
    nullable: true,
  })
  paymentProvider: string | null;

  @ApiProperty({
    description: 'Maximum topics allowed (null = unlimited)',
    example: 3,
    nullable: true,
  })
  maxTopics: number | null;

  @ApiProperty({
    description: 'Current number of subscribed topics',
    example: 2,
  })
  currentTopicCount: number;

  @ApiProperty({
    description: 'Whether user has more topics than their plan allows',
    example: false,
  })
  isOverLimit: boolean;

  @ApiProperty({
    description: 'Plan start date (null for free plan)',
    example: null,
    nullable: true,
  })
  startDate: Date | null;

  @ApiProperty({
    description: 'Plan end date (null for free plan)',
    example: null,
    nullable: true,
  })
  endDate: Date | null;

  @ApiProperty({
    description: 'Days remaining on current plan (null for free)',
    example: null,
    nullable: true,
  })
  daysRemaining: number | null;
}
