import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class GoogleSignInDto {
  @ApiProperty({
    description: 'Google ID token obtained from Google Sign-In on the client',
    example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @IsNotEmpty({ message: 'Google ID token is required' })
  idToken: string;
}
