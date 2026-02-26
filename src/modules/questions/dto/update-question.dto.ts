import { ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateQuestionDto } from './create-question.dto.js';

export class UpdateQuestionDto extends PartialType(CreateQuestionDto) {
  @ApiPropertyOptional({
    description: 'Whether the question is active and available for daily selection',
    example: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean value' })
  isActive?: boolean;
}
