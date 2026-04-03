import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateTopicDto } from './create-topic.dto.js';

/**
 * DTO for updating an existing topic.
 * All fields from CreateTopicDto are optional, plus an `isActive` toggle.
 */
export class UpdateTopicDto extends PartialType(CreateTopicDto) {
  @ApiPropertyOptional({
    description: 'Whether the topic is active and visible to users',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
