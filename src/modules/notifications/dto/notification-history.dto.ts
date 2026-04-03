import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO representing a single notification log entry in API responses.
 */
export class NotificationHistoryDto {
  @ApiProperty({
    description: 'Unique identifier of the notification log entry',
    example: '665a1f2e3b4c5d6e7f8a9b0c',
  })
  _id: string;

  @ApiProperty({
    description: 'ID of the user who received the notification',
    example: '665a1f2e3b4c5d6e7f8a9b0d',
  })
  userId: string;

  @ApiProperty({
    description: 'ID of the daily selection associated with this notification',
    example: '665a1f2e3b4c5d6e7f8a9b0e',
  })
  dailySelectionId: string;

  @ApiProperty({
    description: 'Delivery status of the notification',
    enum: ['pending', 'sent', 'failed', 'delivered'],
    example: 'sent',
  })
  status: string;

  @ApiPropertyOptional({
    description: 'Error message if the notification failed to send',
    example: 'messaging/registration-token-not-registered',
  })
  error?: string;

  @ApiPropertyOptional({
    description: 'Timestamp when the notification was sent',
    example: '2025-06-01T08:00:00.000Z',
    type: String,
    format: 'date-time',
  })
  sentAt?: Date;

  @ApiProperty({
    description: 'Timestamp when the log entry was created',
    example: '2025-06-01T08:00:00.000Z',
    type: String,
    format: 'date-time',
  })
  createdAt: string;
}

/**
 * Pagination metadata for notification history responses.
 */
export class NotificationPaginationMetaDto {
  @ApiProperty({ description: 'Total number of notification log entries', example: 120 })
  total: number;

  @ApiProperty({ description: 'Current page number', example: 1 })
  page: number;

  @ApiProperty({ description: 'Number of records per page', example: 20 })
  limit: number;

  @ApiProperty({ description: 'Total number of pages', example: 6 })
  totalPages: number;
}

/**
 * Paginated response wrapper for notification history.
 */
export class PaginatedNotificationHistoryDto {
  @ApiProperty({
    description: 'Array of notification log entries',
    type: [NotificationHistoryDto],
  })
  data: NotificationHistoryDto[];

  @ApiProperty({
    description: 'Pagination metadata',
    type: NotificationPaginationMetaDto,
  })
  meta: NotificationPaginationMetaDto;
}
