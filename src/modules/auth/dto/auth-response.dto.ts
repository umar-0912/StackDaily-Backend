import { ApiProperty } from '@nestjs/swagger';

class UserResponseInAuth {
  @ApiProperty({
    description: 'User unique identifier',
    example: '507f1f77bcf86cd799439011',
  })
  _id: string;

  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'Username',
    example: 'johndoe123',
  })
  username: string;

  @ApiProperty({
    description: 'User role',
    example: 'user',
    enum: ['user', 'admin'],
  })
  role: string;

  @ApiProperty({
    description: 'Whether the user account is active',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'List of subscribed topic IDs',
    example: ['507f1f77bcf86cd799439011'],
    type: [String],
  })
  subscribedTopics: string[];

  @ApiProperty({
    description: 'User streak information',
    example: { count: 0, lastActiveDate: null },
  })
  streak: {
    count: number;
    lastActiveDate: Date | null;
  };
}

export class AuthResponseDto {
  @ApiProperty({
    description: 'JWT access token for API authentication',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'JWT refresh token to obtain new access tokens',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken: string;

  @ApiProperty({
    description: 'User object (password excluded)',
    type: UserResponseInAuth,
  })
  user: UserResponseInAuth;
}
