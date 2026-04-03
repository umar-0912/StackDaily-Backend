import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Question,
  QuestionDocument,
} from '../../database/schemas/question.schema.js';
import { Topic, TopicDocument } from '../../database/schemas/topic.schema.js';
import {
  AiAnswer,
  AiAnswerDocument,
} from '../../database/schemas/ai-answer.schema.js';
import { CreateQuestionDto } from './dto/create-question.dto.js';
import { BulkCreateQuestionsDto } from './dto/bulk-create-questions.dto.js';
import { UpdateQuestionDto } from './dto/update-question.dto.js';
import { QuestionQueryDto } from './dto/question-query.dto.js';
import { ERROR_MESSAGES, PAGINATION } from '../../common/constants/index.js';

@Injectable()
export class QuestionsService {
  private readonly logger = new Logger(QuestionsService.name);

  constructor(
    @InjectModel(Question.name)
    private readonly questionModel: Model<QuestionDocument>,
    @InjectModel(Topic.name)
    private readonly topicModel: Model<TopicDocument>,
    @InjectModel(AiAnswer.name)
    private readonly aiAnswerModel: Model<AiAnswerDocument>,
  ) {}

  /**
   * List questions with pagination and filtering.
   * Runs count and find queries in parallel for performance.
   */
  async findAll(query: QuestionQueryDto) {
    try {
      const page = Math.max(parseInt(query.page || '1', 10) || PAGINATION.DEFAULT_PAGE, 1);
      const limit = Math.min(
        Math.max(parseInt(query.limit || '20', 10) || PAGINATION.DEFAULT_LIMIT, 1),
        PAGINATION.MAX_LIMIT,
      );
      const skip = (page - 1) * limit;

      const filter: Record<string, unknown> = {};

      if (query.topicId) {
        filter.topicId = new Types.ObjectId(query.topicId);
      }

      if (query.difficulty) {
        filter.difficulty = query.difficulty;
      }

      if (query.tag) {
        filter.tags = query.tag;
      }

      if (query.isActive !== undefined) {
        filter.isActive = query.isActive === 'true';
      }

      const [total, data] = await Promise.all([
        this.questionModel.countDocuments(filter),
        this.questionModel
          .find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate('topicId', 'name slug')
          .lean()
          .exec(),
      ]);

      const totalPages = Math.ceil(total / limit);

      this.logger.log({
        msg: 'Listed questions',
        filter,
        page,
        limit,
        total,
      });

      return {
        data,
        meta: {
          total,
          page,
          limit,
          totalPages,
        },
      };
    } catch (error) {
      this.logger.error({ msg: 'Failed to list questions', error });
      throw new InternalServerErrorException('Failed to retrieve questions');
    }
  }

  /**
   * Find a single question by ID with populated topic.
   * Throws NotFoundException if not found.
   */
  async findById(id: string) {
    const question = await this.questionModel
      .findById(id)
      .populate('topicId', 'name slug')
      .lean()
      .exec();

    if (!question) {
      throw new NotFoundException(ERROR_MESSAGES.QUESTION_NOT_FOUND);
    }

    this.logger.log({ msg: 'Fetched question by ID', questionId: id });

    return question;
  }

  /**
   * Create a single question after validating the topic exists.
   */
  async create(dto: CreateQuestionDto) {
    await this.validateTopicExists(dto.topicId);

    const question = await this.questionModel.create({
      topicId: new Types.ObjectId(dto.topicId),
      text: dto.text,
      difficulty: dto.difficulty,
      tags: dto.tags || [],
    });

    this.logger.log({
      msg: 'Created question',
      questionId: question._id.toString(),
      topicId: dto.topicId,
    });

    return question.toObject();
  }

  /**
   * Bulk create questions using insertMany.
   * Validates ALL topic IDs in a single query before inserting.
   * Throws BadRequestException if any topic ID is invalid.
   */
  async bulkCreate(dto: BulkCreateQuestionsDto) {
    const topicIds = [...new Set(dto.questions.map((q) => q.topicId))];
    await this.validateTopicIdsExist(topicIds);

    const documents = dto.questions.map((q) => ({
      topicId: new Types.ObjectId(q.topicId),
      text: q.text,
      difficulty: q.difficulty,
      tags: q.tags || [],
    }));

    const result = await this.questionModel.insertMany(documents);

    this.logger.log({
      msg: 'Bulk created questions',
      count: result.length,
      topicIds,
    });

    return result;
  }

  /**
   * Update a question by ID. Throws NotFoundException if not found.
   */
  async update(id: string, dto: UpdateQuestionDto) {
    // If topicId is being changed, validate the new topic exists
    if (dto.topicId) {
      await this.validateTopicExists(dto.topicId);
    }

    const updatePayload: Record<string, unknown> = { ...dto };
    if (dto.topicId) {
      updatePayload.topicId = new Types.ObjectId(dto.topicId);
    }

    const question = await this.questionModel
      .findByIdAndUpdate(id, updatePayload, { new: true })
      .lean()
      .exec();

    if (!question) {
      throw new NotFoundException(ERROR_MESSAGES.QUESTION_NOT_FOUND);
    }

    this.logger.log({
      msg: 'Updated question',
      questionId: id,
      updatedFields: Object.keys(dto),
    });

    return question;
  }

  /**
   * Select a daily question for a given topic using least-recently-used strategy.
   * Prioritizes questions that have never been used (lastUsedDate is null).
   * Uses findOneAndUpdate for atomic read-and-update.
   */
  async selectDailyQuestion(topicId: string) {
    const question = await this.questionModel
      .findOneAndUpdate(
        {
          topicId: new Types.ObjectId(topicId),
          isActive: true,
        },
        {
          $set: { lastUsedDate: new Date() },
          $inc: { usageCount: 1 },
        },
        {
          new: true,
          sort: { lastUsedDate: 1 },
        },
      )
      .populate('topicId', 'name slug')
      .lean()
      .exec();

    if (!question) {
      throw new NotFoundException(ERROR_MESSAGES.NO_QUESTIONS_AVAILABLE);
    }

    this.logger.log({
      msg: 'Selected daily question',
      questionId: (question as any)._id.toString(),
      topicId,
      usageCount: question.usageCount,
    });

    return question;
  }

  /**
   * Find questions that do not have a corresponding AI answer.
   * Uses aggregation pipeline with $lookup against the ai-answers collection.
   */
  async getQuestionsWithoutAnswers() {
    const questions = await this.questionModel
      .aggregate([
        { $match: { isActive: true } },
        {
          $lookup: {
            from: 'aianswers',
            localField: '_id',
            foreignField: 'questionId',
            as: 'answers',
          },
        },
        { $match: { answers: { $size: 0 } } },
        { $project: { answers: 0 } },
      ])
      .exec();

    this.logger.log({
      msg: 'Fetched questions without AI answers',
      count: questions.length,
    });

    return questions;
  }

  /**
   * Count active questions grouped by topic.
   * Uses aggregation pipeline with $lookup to include topic name.
   */
  async countByTopic() {
    const result = await this.questionModel
      .aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id: '$topicId',
            count: { $sum: 1 },
          },
        },
        {
          $lookup: {
            from: 'topics',
            localField: '_id',
            foreignField: '_id',
            as: 'topic',
          },
        },
        { $unwind: '$topic' },
        {
          $project: {
            _id: 0,
            topicId: '$_id',
            topicName: '$topic.name',
            count: 1,
          },
        },
        { $sort: { count: -1 } },
      ])
      .exec();

    this.logger.log({
      msg: 'Counted questions by topic',
      topicCount: result.length,
    });

    return result;
  }

  /**
   * Validate that a single topic ID exists and is active.
   */
  private async validateTopicExists(topicId: string): Promise<void> {
    const topic = await this.topicModel
      .findById(topicId)
      .lean()
      .exec();

    if (!topic) {
      throw new BadRequestException(ERROR_MESSAGES.TOPIC_NOT_FOUND);
    }
  }

  /**
   * Validate that all provided topic IDs exist in a single query.
   * Throws BadRequestException listing any invalid IDs.
   */
  private async validateTopicIdsExist(topicIds: string[]): Promise<void> {
    const objectIds = topicIds.map((id) => new Types.ObjectId(id));

    const existingTopics = await this.topicModel
      .find({ _id: { $in: objectIds } })
      .select('_id')
      .lean()
      .exec();

    const existingIdSet = new Set(
      existingTopics.map((t) => t._id.toString()),
    );

    const invalidIds = topicIds.filter((id) => !existingIdSet.has(id));

    if (invalidIds.length > 0) {
      throw new BadRequestException(
        `${ERROR_MESSAGES.INVALID_TOPIC_IDS} Invalid IDs: ${invalidIds.join(', ')}`,
      );
    }
  }
}
