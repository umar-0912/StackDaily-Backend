import { ApiProperty } from '@nestjs/swagger';

export class GenerationStatsDto {
  @ApiProperty({
    description: 'Total number of AI-generated answers in the system',
    example: 1250,
  })
  totalAnswers: number;

  @ApiProperty({
    description: 'Number of answers marked as stale and pending regeneration',
    example: 15,
  })
  staleAnswers: number;

  @ApiProperty({
    description: 'Number of active questions that have no AI answer yet',
    example: 42,
  })
  questionsWithoutAnswers: number;

  @ApiProperty({
    description:
      'Timestamp of the most recently generated answer, or null if no answers exist',
    example: '2025-05-30T02:15:00.000Z',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  lastGenerationRun: Date | null;
}
