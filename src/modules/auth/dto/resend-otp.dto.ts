import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsIn } from 'class-validator';

export class ResendOtpDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'email_verification',
    enum: ['email_verification', 'password_reset'],
  })
  @IsString()
  @IsIn(['email_verification', 'password_reset'])
  type: 'email_verification' | 'password_reset';
}
