import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { AiAnswersService } from './ai-answers.service.js';
import { AiAnswerResponseDto } from './dto/ai-answer-response.dto.js';
import { GenerationStatsDto } from './dto/generation-stats.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';

@ApiTags('AI Answers')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1/ai-answers')
export class AiAnswersController {
  constructor(private readonly aiAnswersService: AiAnswersService) {}

  // ─── GET answer for a question (authenticated) ──────────────
  @Get('question/:questionId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get AI-generated answer for a question' })
  @ApiParam({
    name: 'questionId',
    description: 'The MongoDB ObjectId of the question',
    example: '665a1b2c3d4e5f6a7b8c9d0f',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'AI-generated answer for the requested question',
    type: AiAnswerResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'No AI answer has been generated for this question yet',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid JWT token',
  })
  async getAnswerForQuestion(
    @Param('questionId', ParseObjectIdPipe) questionId: string,
  ): Promise<AiAnswerResponseDto> {
    return this.aiAnswersService.findByQuestionId(
      questionId,
    ) as unknown as AiAnswerResponseDto;
  }

  // ─── POST generate for a single question (admin) ───────────
  @Post('generate/:questionId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate AI answer for a specific question' })
  @ApiParam({
    name: 'questionId',
    description: 'The MongoDB ObjectId of the question to generate an answer for',
    example: '665a1b2c3d4e5f6a7b8c9d0f',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Answer generated (or returned from cache if already fresh)',
    type: AiAnswerResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Question not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid JWT token',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Caller does not have the admin role',
  })
  async generateForQuestion(
    @Param('questionId', ParseObjectIdPipe) questionId: string,
  ): Promise<AiAnswerResponseDto> {
    return this.aiAnswersService.generateForQuestion(
      questionId,
    ) as unknown as AiAnswerResponseDto;
  }

  // ─── POST trigger batch generation (admin) ─────────────────
  @Post('generate-batch')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Trigger nightly generation manually',
    description:
      'Starts the same batch generation process that runs at 2 AM daily. ' +
      'The response returns immediately while generation continues in the background.',
  })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'Batch generation has been started',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid JWT token',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Caller does not have the admin role',
  })
  async triggerBatchGeneration(): Promise<{ message: string }> {
    // Fire-and-forget: kick off the nightly generation without awaiting
    this.aiAnswersService.nightlyGeneration().catch(() => {
      // Errors are already logged inside nightlyGeneration; nothing extra needed.
    });

    return { message: 'Batch generation started' };
  }

  // ─── GET generation statistics (admin) ─────────────────────
  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Get AI generation statistics' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Current AI answer generation statistics',
    type: GenerationStatsDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid JWT token',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Caller does not have the admin role',
  })
  async getStats(): Promise<GenerationStatsDto> {
    return this.aiAnswersService.getGenerationStats() as unknown as GenerationStatsDto;
  }
}
