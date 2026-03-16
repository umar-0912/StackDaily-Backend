import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubscribeResponseDto {
  @ApiProperty({
    description: 'Payment provider used for this subscription',
    example: 'razorpay',
  })
  provider: string;

  @ApiPropertyOptional({
    description:
      'Razorpay hosted checkout URL for the user to complete payment',
    example: 'https://rzp.io/i/xxxxx',
  })
  shortUrl?: string;

  @ApiPropertyOptional({
    description: 'Subscription ID (Razorpay or Stripe)',
    example: 'sub_xxxxxxxxxxxxx',
  })
  subscriptionId?: string;

  @ApiPropertyOptional({
    description: 'Razorpay key ID (public key for client-side SDK)',
    example: 'rzp_test_xxxxxxxxxxxxx',
  })
  razorpayKeyId?: string;

  @ApiPropertyOptional({
    description: 'Stripe PaymentIntent client secret for confirming payment',
    example: 'pi_xxx_secret_xxx',
  })
  clientSecret?: string;

  @ApiPropertyOptional({
    description: 'Stripe ephemeral key secret for mobile SDK',
    example: 'ek_test_xxx',
  })
  ephemeralKey?: string;

  @ApiPropertyOptional({
    description: 'Stripe customer ID',
    example: 'cus_xxxxxxxxxxxxx',
  })
  stripeCustomerId?: string;

  @ApiPropertyOptional({
    description: 'Stripe publishable key for client-side SDK',
    example: 'pk_test_xxxxxxxxxxxxx',
  })
  publishableKey?: string;
}
