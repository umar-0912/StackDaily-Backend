import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsBoolean } from 'class-validator';

export class UnsubscribeTopicDto {
  @ApiProperty({
    description: 'Topic ID to unsubscribe from',
    example: '507f1f77bcf86cd799439011',
  })
  @IsMongoId({ message: 'topicId must be a valid MongoDB ObjectId' })
  topicId: string;

  @ApiPropertyOptional({
    description:
      'If true and progress >= 10%, resets the topic progress to zero. Has no effect when progress < 10%.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  clearProgress?: boolean;
}
