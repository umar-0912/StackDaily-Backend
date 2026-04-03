import {
  Controller,
  Get,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { ProgressService } from './progress.service.js';
import { TopicProgressResponseDto } from './dto/topic-progress-response.dto.js';

@ApiTags('Progress')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('api/v1/progress')
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get progress for all subscribed topics',
    description:
      'Returns progress status, questions answered, and completion percentage for each topic the user has subscribed to.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Progress records retrieved successfully',
    type: [TopicProgressResponseDto],
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async getUserProgress(
    @CurrentUser('_id') userId: string,
  ): Promise<TopicProgressResponseDto[]> {
    return this.progressService.getUserProgress(
      userId.toString(),
    ) as unknown as TopicProgressResponseDto[];
  }

  @Get(':topicId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get progress for a specific topic',
    description:
      'Returns detailed progress information for a single topic including current difficulty level.',
  })
  @ApiParam({
    name: 'topicId',
    description: 'The topic ID to get progress for',
    example: '665a1b2c3d4e5f6a7b8c9d0e',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Topic progress retrieved successfully',
    type: TopicProgressResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async getTopicProgress(
    @CurrentUser('_id') userId: string,
    @Param('topicId') topicId: string,
  ): Promise<TopicProgressResponseDto> {
    return this.progressService.getTopicProgress(
      userId.toString(),
      topicId,
    ) as unknown as TopicProgressResponseDto;
  }
}
