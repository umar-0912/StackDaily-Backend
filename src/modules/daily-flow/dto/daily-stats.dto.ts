import { ApiProperty } from '@nestjs/swagger';

/**
 * Nested DTO for per-topic breakdown within daily stats.
 */
class TopicBreakdownDto {
  @ApiProperty({
    description: 'Name of the topic',
    example: 'JavaScript',
  })
  topicName: string;

  @ApiProperty({
    description: 'The question text selected for this topic',
    example: 'Explain the difference between var, let, and const in JavaScript.',
  })
  questionText: string;

  @ApiProperty({
    description: 'Number of notifications sent for this topic',
    example: 245,
  })
  notificationsSent: number;
}

/**
 * DTO for daily flow statistics response.
 */
export class DailyStatsDto {
  @ApiProperty({
    description: 'The date these stats are for (YYYY-MM-DD)',
    example: '2025-06-01',
  })
  date: string;

  @ApiProperty({
    description: 'Number of topics that have daily content selected',
    example: 8,
  })
  topicsWithContent: number;

  @ApiProperty({
    description: 'Total notifications sent across all topics',
    example: 1250,
  })
  totalNotificationsSent: number;

  @ApiProperty({
    description: 'Per-topic breakdown of daily selections',
    type: [TopicBreakdownDto],
  })
  breakdown: TopicBreakdownDto[];
}
