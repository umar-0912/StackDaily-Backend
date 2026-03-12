import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty } from 'class-validator';

/**
 * DTO for requesting the next question after watching an ad.
 */
export class NextQuestionDto {
  @ApiProperty({
    description: 'The topic ID to unlock the next question for',
    example: '665a1b2c3d4e5f6a7b8c9d0e',
  })
  @IsNotEmpty()
  @IsMongoId({ message: 'topicId must be a valid MongoDB ObjectId' })
  topicId: string;
}
