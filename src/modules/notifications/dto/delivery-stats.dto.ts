import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO representing delivery statistics for a daily selection's notifications.
 * Provides a breakdown of notification statuses.
 */
export class DeliveryStatsDto {
  @ApiProperty({
    description: 'Total number of notifications for this daily selection',
    example: 150,
  })
  total: number;

  @ApiProperty({
    description: 'Number of notifications successfully sent',
    example: 140,
  })
  sent: number;

  @ApiProperty({
    description: 'Number of notifications that failed to send',
    example: 5,
  })
  failed: number;

  @ApiProperty({
    description: 'Number of notifications confirmed as delivered',
    example: 130,
  })
  delivered: number;

  @ApiProperty({
    description: 'Number of notifications still pending',
    example: 5,
  })
  pending: number;
}
