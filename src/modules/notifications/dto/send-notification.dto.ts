import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsObject, IsOptional, IsNotEmpty } from 'class-validator';

/**
 * DTO for sending a push notification.
 * Used by the test notification endpoint and internal callers.
 */
export class SendNotificationDto {
  @ApiPropertyOptional({
    description: 'Title of the push notification (defaults to "StackDaily Test")',
    example: 'New Daily Question!',
  })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({
    description: 'Body text of the push notification (defaults to a test message)',
    example: 'What is a closure in JavaScript? Tap to learn more.',
  })
  @IsString()
  @IsOptional()
  body?: string;

  @ApiPropertyOptional({
    description:
      'Optional key-value data payload sent alongside the notification',
    example: { topicId: '665a1f2e3b4c5d6e7f8a9b0c', type: 'daily_question' },
  })
  @IsObject()
  @IsOptional()
  data?: Record<string, string>;
}
