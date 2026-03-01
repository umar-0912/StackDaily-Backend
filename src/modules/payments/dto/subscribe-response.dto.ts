import { ApiProperty } from '@nestjs/swagger';

export class SubscribeResponseDto {
  @ApiProperty({
    description:
      'Razorpay hosted checkout URL for the user to complete payment',
    example: 'https://rzp.io/i/xxxxx',
  })
  shortUrl: string;

  @ApiProperty({
    description: 'Razorpay subscription ID',
    example: 'sub_xxxxxxxxxxxxx',
  })
  subscriptionId: string;
}
