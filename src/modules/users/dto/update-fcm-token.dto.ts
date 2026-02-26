import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class UpdateFcmTokenDto {
  @ApiProperty({
    description: 'Firebase Cloud Messaging device token for push notifications',
    example: 'dGhpcyBpcyBhIHNhbXBsZSBGQ00gdG9rZW4...',
  })
  @IsString({ message: 'fcmToken must be a string' })
  @IsNotEmpty({ message: 'fcmToken must not be empty' })
  fcmToken: string;
}
