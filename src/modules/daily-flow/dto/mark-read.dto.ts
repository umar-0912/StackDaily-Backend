import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty } from 'class-validator';

/**
 * DTO for marking a daily question as read and advancing user progress.
 */
export class MarkReadDto {
  @ApiProperty({
    description: 'The ID of the daily selection to mark as read',
    example: '665a1b2c3d4e5f6a7b8c9d0e',
  })
  @IsNotEmpty()
  @IsMongoId({ message: 'dailySelectionId must be a valid MongoDB ObjectId' })
  dailySelectionId: string;

  @ApiProperty({
    description: 'The topic ID associated with the question being marked as read',
    example: '665a1b2c3d4e5f6a7b8c9d0e',
  })
  @IsNotEmpty()
  @IsMongoId({ message: 'topicId must be a valid MongoDB ObjectId' })
  topicId: string;
}
