import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { TopicsService } from './topics.service.js';
import { CreateTopicDto } from './dto/create-topic.dto.js';
import { UpdateTopicDto } from './dto/update-topic.dto.js';
import { TopicQueryDto } from './dto/topic-query.dto.js';
import {
  TopicResponseDto,
  PaginatedTopicsResponseDto,
} from './dto/topic-response.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';

@ApiTags('Topics')
@Controller('api/v1/topics')
export class TopicsController {
  constructor(private readonly topicsService: TopicsService) {}

  // ────────────────────────── GET /topics ──────────────────────────────────

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List all topics',
    description:
      'Retrieve a paginated list of topics. Supports filtering by category and active status.',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    description: 'Filter topics by category name',
    example: 'Programming',
  })
  @ApiQuery({
    name: 'isActive',
    required: false,
    description: 'Filter by active status ("true" or "false")',
    example: 'true',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (starts at 1)',
    example: '1',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Records per page (max 100)',
    example: '20',
  })
  @ApiResponse({
    status: 200,
    description: 'Topics retrieved successfully',
    type: PaginatedTopicsResponseDto,
  })
  async findAll(@Query() query: TopicQueryDto) {
    return this.topicsService.findAll(query);
  }

  // ────────────────────────── GET /topics/:id ─────────────────────────────

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get a topic by ID',
    description: 'Retrieve a single topic by its unique MongoDB identifier.',
  })
  @ApiParam({
    name: 'id',
    description: 'Topic ID (MongoDB ObjectId)',
    example: '665a1f2e3b4c5d6e7f8a9b0c',
  })
  @ApiResponse({
    status: 200,
    description: 'Topic retrieved successfully',
    type: TopicResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid MongoDB ObjectId format',
  })
  @ApiResponse({
    status: 404,
    description: 'Topic not found',
  })
  async findById(
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<TopicResponseDto> {
    return this.topicsService.findById(id) as unknown as TopicResponseDto;
  }

  // ────────────────────────── POST /topics ────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a new topic',
    description:
      'Create a new learning topic. The slug is auto-generated from the name. Requires admin role.',
  })
  @ApiResponse({
    status: 201,
    description: 'Topic created successfully',
    type: TopicResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
  })
  @ApiResponse({
    status: 401,
    description: 'Authentication required',
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions (admin role required)',
  })
  @ApiResponse({
    status: 409,
    description: 'A topic with this name or slug already exists',
  })
  async create(@Body() dto: CreateTopicDto): Promise<TopicResponseDto> {
    return this.topicsService.create(dto) as unknown as TopicResponseDto;
  }

  // ────────────────────────── PATCH /topics/:id ───────────────────────────

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update an existing topic',
    description:
      'Partially update a topic by ID. If the name is changed the slug is regenerated. Requires admin role.',
  })
  @ApiParam({
    name: 'id',
    description: 'Topic ID (MongoDB ObjectId)',
    example: '665a1f2e3b4c5d6e7f8a9b0c',
  })
  @ApiResponse({
    status: 200,
    description: 'Topic updated successfully',
    type: TopicResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid MongoDB ObjectId format or validation failed',
  })
  @ApiResponse({
    status: 401,
    description: 'Authentication required',
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions (admin role required)',
  })
  @ApiResponse({
    status: 404,
    description: 'Topic not found',
  })
  async update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateTopicDto,
  ): Promise<TopicResponseDto> {
    return this.topicsService.update(id, dto) as unknown as TopicResponseDto;
  }

  // ────────────────────────── DELETE /topics/:id ─────────────────────────
  @Patch(':id/deactivate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Deactivate a topic (soft delete)',
    description: 'Sets a topic as inactive. Requires admin role.',
  })
  @ApiParam({
    name: 'id',
    description: 'Topic ID (MongoDB ObjectId)',
    example: '665a1f2e3b4c5d6e7f8a9b0c',
  })
  @ApiResponse({ status: 200, description: 'Topic deactivated successfully', type: TopicResponseDto })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions (admin role required)' })
  @ApiResponse({ status: 404, description: 'Topic not found' })
  async deactivate(
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<TopicResponseDto> {
    return this.topicsService.update(id, { isActive: false }) as unknown as TopicResponseDto;
  }
}
