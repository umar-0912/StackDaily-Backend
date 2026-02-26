import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty } from 'class-validator';

/**
 * DTO for marking a daily selection as read and updating the user's streak.
 */
export class MarkReadDto {
  @ApiProperty({
    description: 'The ID of the daily selection to mark as read',
    example: '665a1b2c3d4e5f6a7b8c9d0e',
  })
  @IsNotEmpty()
  @IsMongoId({ message: 'dailySelectionId must be a valid MongoDB ObjectId' })
  dailySelectionId: string;
}
