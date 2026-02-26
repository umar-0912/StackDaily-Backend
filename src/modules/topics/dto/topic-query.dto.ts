import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBooleanString, IsNumberString, IsOptional, IsString } from 'class-validator';

/**
 * DTO for query parameters when listing topics.
 * Supports filtering by category, active status, and pagination.
 */
export class TopicQueryDto {
  @ApiPropertyOptional({
    description: 'Filter topics by category name',
    example: 'Programming',
  })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({
    description: 'Filter by active status ("true" or "false")',
    example: 'true',
  })
  @IsBooleanString()
  @IsOptional()
  isActive?: string;

  @ApiPropertyOptional({
    description: 'Page number for pagination (starts at 1)',
    example: '1',
    default: '1',
  })
  @IsNumberString()
  @IsOptional()
  page?: string;

  @ApiPropertyOptional({
    description: 'Number of records per page (max 100)',
    example: '20',
    default: '20',
  })
  @IsNumberString()
  @IsOptional()
  limit?: string;
}
