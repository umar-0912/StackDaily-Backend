import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  MinLength,
  MaxLength,
  IsNumber,
  IsOptional,
} from 'class-validator';

/**
 * DTO for creating a new topic.
 * The slug is auto-generated from the name on the server side.
 */
export class CreateTopicDto {
  @ApiProperty({
    description: 'Display name of the topic (must be unique)',
    example: 'JavaScript Basics',
    minLength: 2,
    maxLength: 50,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @ApiProperty({
    description: 'Category the topic belongs to',
    example: 'Programming',
  })
  @IsString()
  category: string;

  @ApiProperty({
    description: 'A brief description of what the topic covers',
    example: 'Learn the fundamentals of JavaScript including variables, functions, and control flow.',
    minLength: 10,
    maxLength: 500,
  })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  description: string;

  @ApiPropertyOptional({
    description: 'Icon identifier or emoji for the topic',
    example: 'javascript',
  })
  @IsString()
  @IsOptional()
  icon?: string;

  @ApiPropertyOptional({
    description: 'Numeric sort order for display (lower values appear first)',
    example: 1,
    default: 0,
  })
  @IsNumber()
  @IsOptional()
  sortOrder?: number;
}
