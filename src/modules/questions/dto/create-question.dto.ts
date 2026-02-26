import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsMongoId,
  IsEnum,
  IsArray,
  IsOptional,
  MinLength,
  MaxLength,
} from 'class-validator';
import { QuestionDifficulty } from '../../../database/schemas/question.schema.js';

export class CreateQuestionDto {
  @ApiProperty({
    description: 'The MongoDB ObjectId of the topic this question belongs to',
    example: '507f1f77bcf86cd799439011',
  })
  @IsMongoId({ message: 'topicId must be a valid MongoDB ObjectId' })
  topicId: string;

  @ApiProperty({
    description: 'The question text to be presented to the learner',
    example: 'Explain the difference between var, let, and const in JavaScript.',
    minLength: 10,
    maxLength: 1000,
  })
  @IsString()
  @MinLength(10, { message: 'Question text must be at least 10 characters long' })
  @MaxLength(1000, { message: 'Question text must not exceed 1000 characters' })
  text: string;

  @ApiProperty({
    description: 'Difficulty level of the question',
    enum: QuestionDifficulty,
    example: QuestionDifficulty.INTERMEDIATE,
    default: QuestionDifficulty.INTERMEDIATE,
    required: false,
  })
  @IsOptional()
  @IsEnum(QuestionDifficulty, {
    message: `difficulty must be one of: ${Object.values(QuestionDifficulty).join(', ')}`,
  })
  difficulty?: QuestionDifficulty;

  @ApiProperty({
    description: 'Tags for categorizing and filtering questions',
    example: ['closures', 'scope', 'hoisting'],
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray({ message: 'tags must be an array of strings' })
  @IsString({ each: true, message: 'Each tag must be a string' })
  tags?: string[];
}
