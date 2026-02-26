import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { CreateQuestionDto } from './create-question.dto.js';

export class BulkCreateQuestionsDto {
  @ApiProperty({
    description: 'Array of questions to create in bulk (1 to 100 items)',
    type: [CreateQuestionDto],
    minItems: 1,
    maxItems: 100,
  })
  @IsArray({ message: 'questions must be an array' })
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  @ArrayMinSize(1, { message: 'At least one question is required' })
  @ArrayMaxSize(100, { message: 'Cannot create more than 100 questions at once' })
  questions: CreateQuestionDto[];
}
