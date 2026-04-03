import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { SubscriptionTier, PaymentProvider } from '../../../database/schemas/user.schema.js';

export class SubscribeRequestDto {
  @ApiProperty({
    description: 'Subscription tier to purchase',
    enum: SubscriptionTier,
    example: 'monthly',
  })
  @IsEnum(SubscriptionTier, {
    message: 'tier must be one of: monthly, half_yearly, yearly',
  })
  tier: SubscriptionTier;

  @ApiPropertyOptional({
    description: 'Payment provider to use (defaults to razorpay)',
    enum: PaymentProvider,
    example: 'razorpay',
  })
  @IsOptional()
  @IsEnum(PaymentProvider, {
    message: 'provider must be one of: razorpay, stripe',
  })
  provider?: PaymentProvider;
}
