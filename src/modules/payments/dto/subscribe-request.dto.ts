import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { SubscriptionTier } from '../../../database/schemas/user.schema.js';

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
}
