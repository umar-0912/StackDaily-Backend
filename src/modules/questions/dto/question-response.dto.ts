import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuestionDifficulty } from '../../../database/schemas/question.schema.js';

class TopicSummaryDto {
  @ApiProperty({
    description: 'Topic ID',
    example: '507f1f77bcf86cd799439011',
  })
  _id: string;

  @ApiProperty({
    description: 'Topic name',
    example: 'JavaScript',
  })
  name: string;

  @ApiProperty({
    description: 'Topic slug',
    example: 'javascript',
  })
  slug: string;
}

export class QuestionResponseDto {
  @ApiProperty({
    description: 'Question ID',
    example: '507f1f77bcf86cd799439011',
  })
  _id: string;

  @ApiProperty({
    description: 'The topic this question belongs to',
    type: TopicSummaryDto,
  })
  topicId: TopicSummaryDto;

  @ApiProperty({
    description: 'The question text',
    example: 'Explain the difference between var, let, and const in JavaScript.',
  })
  text: string;

  @ApiProperty({
    description: 'Difficulty level of the question',
    enum: QuestionDifficulty,
    example: QuestionDifficulty.INTERMEDIATE,
  })
  difficulty: QuestionDifficulty;

  @ApiProperty({
    description: 'Tags for categorizing the question',
    example: ['closures', 'scope', 'hoisting'],
    type: [String],
  })
  tags: string[];

  @ApiProperty({
    description: 'Whether the question is active',
    example: true,
  })
  isActive: boolean;

  @ApiPropertyOptional({
    description: 'Date when the question was last used for daily selection',
    example: '2025-05-20T08:00:00.000Z',
    type: String,
    nullable: true,
  })
  lastUsedDate?: Date | null;

  @ApiProperty({
    description: 'Number of times this question has been used',
    example: 5,
  })
  usageCount: number;

  @ApiProperty({
    description: 'Record creation timestamp',
    example: '2025-05-15T10:30:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Record last update timestamp',
    example: '2025-05-20T08:00:00.000Z',
  })
  updatedAt: Date;
}

export class PaginationMetaDto {
  @ApiProperty({ description: 'Total number of matching records', example: 42 })
  total: number;

  @ApiProperty({ description: 'Current page number', example: 1 })
  page: number;

  @ApiProperty({ description: 'Number of items per page', example: 20 })
  limit: number;

  @ApiProperty({ description: 'Total number of pages', example: 3 })
  totalPages: number;
}

export class PaginatedQuestionsResponseDto {
  @ApiProperty({
    description: 'Array of question records',
    type: [QuestionResponseDto],
  })
  data: QuestionResponseDto[];

  @ApiProperty({
    description: 'Pagination metadata',
    type: PaginationMetaDto,
  })
  meta: PaginationMetaDto;
}

export class TopicQuestionCountDto {
  @ApiProperty({
    description: 'Topic ID',
    example: '507f1f77bcf86cd799439011',
  })
  topicId: string;

  @ApiProperty({
    description: 'Topic name',
    example: 'JavaScript',
  })
  topicName: string;

  @ApiProperty({
    description: 'Number of active questions for this topic',
    example: 15,
  })
  count: number;
}
