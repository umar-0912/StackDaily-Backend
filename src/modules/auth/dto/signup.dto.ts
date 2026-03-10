import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
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
    description: 'Full name of the user',
    example: 'John Doe',
    minLength: 2,
    maxLength: 50,
  })
  @IsString()
  @MinLength(2, { message: 'Name must be at least 2 characters long' })
  @MaxLength(50, { message: 'Name must not exceed 50 characters' })
  name: string;

  @ApiProperty({
    description:
      'Password (minimum 8 characters, must include uppercase, lowercase, and a number)',
    example: 'SecurePass1',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
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
