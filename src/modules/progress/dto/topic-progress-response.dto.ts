import { ApiProperty } from '@nestjs/swagger';

class TopicSummaryDto {
  @ApiProperty({ example: '665a1b2c3d4e5f6a7b8c9d0e' })
  _id: string;

  @ApiProperty({ example: 'JavaScript' })
  name: string;

  @ApiProperty({ example: 'javascript' })
  slug: string;

  @ApiProperty({ example: 'language-javascript', required: false, nullable: true })
  icon?: string | null;
}

export class TopicProgressResponseDto {
  @ApiProperty({ example: '665a1b2c3d4e5f6a7b8c9d0e' })
  _id: string;

  @ApiProperty({ description: 'Topic information', type: TopicSummaryDto })
  topic: TopicSummaryDto;

  @ApiProperty({
    description: 'Current progress status',
    enum: ['not_started', 'in_progress', 'completed'],
    example: 'in_progress',
  })
  status: string;

  @ApiProperty({ description: 'Current position in the question sequence', example: 12 })
  currentQuestionIndex: number;

  @ApiProperty({ description: 'Number of questions answered so far', example: 12 })
  questionsAnswered: number;

  @ApiProperty({ description: 'Total active questions in this topic', example: 100 })
  totalQuestions: number;

  @ApiProperty({
    description: 'Current difficulty level based on position',
    enum: ['beginner', 'intermediate', 'advanced'],
    example: 'intermediate',
  })
  currentDifficulty: string;

  @ApiProperty({ description: 'Completion percentage (0-100)', example: 12 })
  percentComplete: number;

  @ApiProperty({ description: 'Date when the user started this topic', nullable: true })
  startedAt: Date | null;

  @ApiProperty({ description: 'Date when the user last completed all questions', nullable: true })
  completedAt: Date | null;
}
