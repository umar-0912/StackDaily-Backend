import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsArray,
  IsOptional,
  IsMongoId,
} from 'class-validator';

export class SignupDto {
  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@example.com',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty({
    description: 'Unique username (alphanumeric characters only)',
    example: 'johndoe123',
    minLength: 3,
    maxLength: 30,
  })
  @IsString()
  @MinLength(3, { message: 'Username must be at least 3 characters long' })
  @MaxLength(30, { message: 'Username must not exceed 30 characters' })
  @Matches(/^[a-zA-Z0-9]+$/, {
    message: 'Username must contain only alphanumeric characters',
  })
  username: string;

  @ApiProperty({
    description:
      'Password (minimum 8 characters, must include uppercase, lowercase, and a number)',
    example: 'SecurePass1',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  password: string;

  @ApiProperty({
    description: 'List of topic IDs to subscribe to on registration',
    example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray({ message: 'subscribedTopics must be an array' })
  @IsMongoId({ each: true, message: 'Each topic ID must be a valid MongoDB ObjectId' })
  subscribedTopics?: string[];
}
