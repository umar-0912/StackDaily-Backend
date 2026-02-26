import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO representing a topic in API responses.
 * Mirrors the Topic schema with Swagger documentation.
 */
export class TopicResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the topic',
    example: '665a1f2e3b4c5d6e7f8a9b0c',
  })
  _id: string;

  @ApiProperty({
    description: 'Display name of the topic',
    example: 'JavaScript Basics',
  })
  name: string;

  @ApiProperty({
    description: 'URL-friendly slug derived from the name',
    example: 'javascript-basics',
  })
  slug: string;

  @ApiProperty({
    description: 'Category the topic belongs to',
    example: 'Programming',
  })
  category: string;

  @ApiProperty({
    description: 'Brief description of what the topic covers',
    example: 'Learn the fundamentals of JavaScript including variables, functions, and control flow.',
  })
  description: string;

  @ApiPropertyOptional({
    description: 'Icon identifier or emoji for the topic',
    example: 'javascript',
  })
  icon?: string;

  @ApiProperty({
    description: 'Whether the topic is active and visible to users',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Numeric sort order for display',
    example: 1,
  })
  sortOrder: number;

  @ApiProperty({
    description: 'Timestamp when the topic was created',
    example: '2024-06-01T12:00:00.000Z',
  })
  createdAt: string;

  @ApiProperty({
    description: 'Timestamp when the topic was last updated',
    example: '2024-06-01T12:00:00.000Z',
  })
  updatedAt: string;
}

/**
 * Pagination metadata returned alongside paginated lists.
 */
export class PaginationMetaDto {
  @ApiProperty({ description: 'Total number of matching records', example: 42 })
  total: number;

  @ApiProperty({ description: 'Current page number', example: 1 })
  page: number;

  @ApiProperty({ description: 'Number of records per page', example: 20 })
  limit: number;

  @ApiProperty({ description: 'Total number of pages', example: 3 })
  totalPages: number;
}

/**
 * Paginated response wrapper for topic lists.
 */
export class PaginatedTopicsResponseDto {
  @ApiProperty({
    description: 'Array of topic records',
    type: [TopicResponseDto],
  })
  data: TopicResponseDto[];

  @ApiProperty({
    description: 'Pagination metadata',
    type: PaginationMetaDto,
  })
  meta: PaginationMetaDto;
}
