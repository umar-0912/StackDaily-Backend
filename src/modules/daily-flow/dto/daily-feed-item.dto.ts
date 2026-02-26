import { ApiProperty } from '@nestjs/swagger';

/**
 * Nested DTO representing the topic summary within a daily feed item.
 */
class FeedTopicDto {
  @ApiProperty({
    description: 'Topic display name',
    example: 'JavaScript',
  })
  name: string;

  @ApiProperty({
    description: 'URL-friendly topic slug',
    example: 'javascript',
  })
  slug: string;

  @ApiProperty({
    description: 'Topic icon identifier',
    example: 'javascript-icon',
    required: false,
    nullable: true,
  })
  icon?: string | null;
}

/**
 * Nested DTO representing the question within a daily feed item.
 */
class FeedQuestionDto {
  @ApiProperty({
    description: 'The question text',
    example: 'Explain the difference between var, let, and const in JavaScript.',
  })
  text: string;

  @ApiProperty({
    description: 'Difficulty level of the question',
    example: 'intermediate',
    enum: ['beginner', 'intermediate', 'advanced'],
  })
  difficulty: string;

  @ApiProperty({
    description: 'Tags associated with the question',
    example: ['closures', 'scope', 'hoisting'],
    type: [String],
  })
  tags: string[];
}

/**
 * Nested DTO representing the AI-generated answer within a daily feed item.
 */
class FeedAnswerDto {
  @ApiProperty({
    description: 'AI-generated answer content in markdown format',
    example:
      '## Closures in JavaScript\n\nA closure is a function that retains access to its lexical scope...',
  })
  content: string;

  @ApiProperty({
    description: 'Timestamp when the answer was generated',
    example: '2025-05-30T14:30:00.000Z',
    type: String,
    format: 'date-time',
  })
  generatedAt: Date;
}

/**
 * DTO for a single item in the user's daily learning feed.
 */
export class DailyFeedItemDto {
  @ApiProperty({
    description: 'Unique identifier of the daily selection record',
    example: '665a1b2c3d4e5f6a7b8c9d0e',
  })
  dailySelectionId: string;

  @ApiProperty({
    description: 'Topic information',
    type: FeedTopicDto,
  })
  topic: FeedTopicDto;

  @ApiProperty({
    description: 'Daily question for this topic',
    type: FeedQuestionDto,
  })
  question: FeedQuestionDto;

  @ApiProperty({
    description: 'AI-generated answer for the question',
    type: FeedAnswerDto,
  })
  answer: FeedAnswerDto;
}
