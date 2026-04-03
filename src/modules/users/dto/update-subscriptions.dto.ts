import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsMongoId } from 'class-validator';

export class UpdateSubscriptionsDto {
  @ApiProperty({
    description: 'Array of topic IDs to subscribe to (replaces current subscriptions)',
    example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
    type: [String],
  })
  @IsArray({ message: 'topicIds must be an array' })
  @IsMongoId({ each: true, message: 'Each topic ID must be a valid MongoDB ObjectId' })
  topicIds: string[];
}
