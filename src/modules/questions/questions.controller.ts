import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
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
import { QuestionsService } from './questions.service.js';
import { CreateQuestionDto } from './dto/create-question.dto.js';
import { BulkCreateQuestionsDto } from './dto/bulk-create-questions.dto.js';
import { UpdateQuestionDto } from './dto/update-question.dto.js';
import { QuestionQueryDto } from './dto/question-query.dto.js';
import {
  QuestionResponseDto,
  PaginatedQuestionsResponseDto,
  TopicQuestionCountDto,
} from './dto/question-response.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';

@ApiTags('Questions')
@Controller('api/v1/questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List questions with filters and pagination' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of questions returned successfully',
    type: PaginatedQuestionsResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin role required' })
  async findAll(@Query() query: QuestionQueryDto) {
    return this.questionsService.findAll(query);
  }

  @Get('stats/by-topic')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get active question count per topic' })
  @ApiResponse({
    status: 200,
    description: 'Question counts grouped by topic',
    type: [TopicQuestionCountDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin role required' })
  async countByTopic() {
    return this.questionsService.countByTopic();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a question by ID' })
  @ApiParam({ name: 'id', description: 'Question MongoDB ObjectId' })
  @ApiResponse({
    status: 200,
    description: 'Question found and returned',
    type: QuestionResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Question not found' })
  async findById(@Param('id', ParseObjectIdPipe) id: string) {
    return this.questionsService.findById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a single question' })
  @ApiResponse({
    status: 201,
    description: 'Question created successfully',
    type: QuestionResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error or invalid topic ID' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin role required' })
  async create(@Body() dto: CreateQuestionDto) {
    return this.questionsService.create(dto);
  }

  @Post('bulk')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Bulk create questions (up to 100)' })
  @ApiResponse({
    status: 201,
    description: 'Questions created successfully',
    type: [QuestionResponseDto],
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid topic IDs or validation error',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin role required' })
  async bulkCreate(@Body() dto: BulkCreateQuestionsDto) {
    return this.questionsService.bulkCreate(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a question by ID' })
  @ApiParam({ name: 'id', description: 'Question MongoDB ObjectId' })
  @ApiResponse({
    status: 200,
    description: 'Question updated successfully',
    type: QuestionResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error or invalid topic ID' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin role required' })
  @ApiResponse({ status: 404, description: 'Question not found' })
  async update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.questionsService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deactivate a question (soft delete)' })
  @ApiParam({ name: 'id', description: 'Question MongoDB ObjectId' })
  @ApiResponse({ status: 200, description: 'Question deactivated successfully', type: QuestionResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin role required' })
  @ApiResponse({ status: 404, description: 'Question not found' })
  async deactivate(@Param('id', ParseObjectIdPipe) id: string) {
    return this.questionsService.update(id, { isActive: false });
  }
}
