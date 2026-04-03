import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsMongoId,
  IsEnum,
  IsString,
  IsBooleanString,
  IsNumberString,
} from 'class-validator';
import { QuestionDifficulty } from '../../../database/schemas/question.schema.js';

export class QuestionQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by topic ID',
    example: '507f1f77bcf86cd799439011',
  })
  @IsOptional()
  @IsMongoId({ message: 'topicId must be a valid MongoDB ObjectId' })
  topicId?: string;

  @ApiPropertyOptional({
    description: 'Filter by difficulty level',
    enum: QuestionDifficulty,
    example: QuestionDifficulty.INTERMEDIATE,
  })
  @IsOptional()
  @IsEnum(QuestionDifficulty, {
    message: `difficulty must be one of: ${Object.values(QuestionDifficulty).join(', ')}`,
  })
  difficulty?: QuestionDifficulty;

  @ApiPropertyOptional({
    description: 'Filter by tag (single tag match)',
    example: 'closures',
  })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional({
    description: 'Filter by active status (true or false)',
    example: 'true',
  })
  @IsOptional()
  @IsBooleanString({ message: 'isActive must be a boolean string (true or false)' })
  isActive?: string;

  @ApiPropertyOptional({
    description: 'Page number for pagination (starts at 1)',
    example: '1',
  })
  @IsOptional()
  @IsNumberString({}, { message: 'page must be a number string' })
  page?: string;

  @ApiPropertyOptional({
    description: 'Number of items per page (max 100)',
    example: '20',
  })
  @IsOptional()
  @IsNumberString({}, { message: 'limit must be a number string' })
  limit?: string;
}
