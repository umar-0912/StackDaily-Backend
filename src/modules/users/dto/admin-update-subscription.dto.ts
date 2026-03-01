import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsInt, Min, Max } from 'class-validator';
import { SubscriptionPlan } from '../../../database/schemas/user.schema.js';

export class AdminUpdateSubscriptionDto {
  @ApiProperty({
    description: 'The subscription plan to set',
    enum: SubscriptionPlan,
    example: 'pro',
  })
  @IsEnum(SubscriptionPlan, {
    message: 'plan must be one of: free, pro',
  })
  plan: SubscriptionPlan;

  @ApiPropertyOptional({
    description:
      'Duration in days for Pro plan (default: 30). Only used when plan is "pro".',
    example: 30,
    minimum: 1,
    maximum: 365,
  })
  @IsOptional()
  @IsInt({ message: 'durationDays must be an integer' })
  @Min(1, { message: 'durationDays must be at least 1' })
  @Max(365, { message: 'durationDays must not exceed 365' })
  durationDays?: number;
}
