import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Topic, TopicDocument } from '../../database/schemas/topic.schema.js';
import { CreateTopicDto } from './dto/create-topic.dto.js';
import { UpdateTopicDto } from './dto/update-topic.dto.js';
import { TopicQueryDto } from './dto/topic-query.dto.js';
import { ERROR_MESSAGES, PAGINATION } from '../../common/constants/index.js';

/**
 * Shape returned by paginated list queries.
 */
export interface PaginatedTopics {
  data: Topic[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * Simple in-memory cache entry with time-to-live.
 */
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/**
 * Service responsible for all topic-related business logic.
 */
@Injectable()
export class TopicsService {
  private readonly logger = new Logger(TopicsService.name);

  /** In-memory cache for frequently accessed data (e.g. active topics). */
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  /** Cache TTL in milliseconds (5 minutes). */
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000;

  /** Cache key for the active topics query. */
  private static readonly CACHE_KEY_ACTIVE_TOPICS = 'activeTopics';

  constructor(
    @InjectModel(Topic.name)
    private readonly topicModel: Model<TopicDocument>,
  ) {}

  // ───────────────────────────── List (paginated) ─────────────────────────────

  /**
   * Retrieve a paginated, filterable list of topics sorted by `sortOrder`.
   */
  async findAll(query: TopicQueryDto): Promise<PaginatedTopics> {
    try {
      const page = Math.max(parseInt(query.page || String(PAGINATION.DEFAULT_PAGE), 10), 1);
      const limit = Math.min(
        Math.max(parseInt(query.limit || String(PAGINATION.DEFAULT_LIMIT), 10), 1),
        PAGINATION.MAX_LIMIT,
      );
      const skip = (page - 1) * limit;

      const filter: Record<string, unknown> = {};

      if (query.category) {
        filter.category = query.category;
      }

      if (query.isActive !== undefined) {
        filter.isActive = query.isActive === 'true';
      }

      this.logger.log({
        msg: 'Listing topics',
        filter,
        page,
        limit,
      });

      const [data, total] = await Promise.all([
        this.topicModel
          .find(filter)
          .sort({ sortOrder: 1 })
          .skip(skip)
          .limit(limit)
          .lean()
          .exec(),
        this.topicModel.countDocuments(filter).exec(),
      ]);

      const totalPages = Math.ceil(total / limit);

      this.logger.log({
        msg: 'Topics listed successfully',
        total,
        page,
        totalPages,
      });

      return {
        data,
        meta: { total, page, limit, totalPages },
      };
    } catch (error) {
      this.logger.error({ msg: 'Failed to list topics', error });
      throw new InternalServerErrorException('Failed to retrieve topics');
    }
  }

  // ───────────────────────────── Find by ID ───────────────────────────────────

  /**
   * Find a single topic by its MongoDB `_id`.
   * @throws NotFoundException when no topic matches the given ID.
   */
  async findById(id: string): Promise<Topic> {
    this.logger.log({ msg: 'Finding topic by ID', topicId: id });

    const topic = await this.topicModel.findById(id).lean().exec();

    if (!topic) {
      this.logger.warn({ msg: 'Topic not found', topicId: id });
      throw new NotFoundException(ERROR_MESSAGES.TOPIC_NOT_FOUND);
    }

    this.logger.log({ msg: 'Topic found', topicId: id, slug: topic.slug });
    return topic;
  }

  // ───────────────────────────── Find by slug ─────────────────────────────────

  /**
   * Find a single topic by its URL-friendly slug.
   * Returns `null` if no topic matches.
   */
  async findBySlug(slug: string): Promise<Topic | null> {
    this.logger.log({ msg: 'Finding topic by slug', slug });

    const topic = await this.topicModel
      .findOne({ slug: slug.toLowerCase() })
      .lean()
      .exec();

    if (topic) {
      this.logger.log({ msg: 'Topic found by slug', topicId: (topic as any)._id, slug });
    } else {
      this.logger.log({ msg: 'No topic found for slug', slug });
    }

    return topic;
  }

  // ───────────────────────────── Create ───────────────────────────────────────

  /**
   * Create a new topic.
   * The slug is auto-generated from the topic name.
   * @throws ConflictException when a topic with the same name or slug exists.
   */
  async create(dto: CreateTopicDto): Promise<Topic> {
    const slug = this.generateSlug(dto.name);

    this.logger.log({ msg: 'Creating topic', name: dto.name, slug });

    try {
      const topic = await this.topicModel.create({ ...dto, slug });

      this.logger.log({
        msg: 'Topic created successfully',
        topicId: topic._id,
        name: topic.name,
        slug: topic.slug,
      });

      // Invalidate the active-topics cache so the next read picks up the change
      this.invalidateCache(TopicsService.CACHE_KEY_ACTIVE_TOPICS);

      return topic.toObject();
    } catch (error: any) {
      // MongoDB duplicate-key error code
      if (error.code === 11000) {
        this.logger.warn({
          msg: 'Duplicate topic creation attempted',
          name: dto.name,
          slug,
          keyPattern: error.keyPattern,
        });
        throw new ConflictException(
          `A topic with this ${Object.keys(error.keyPattern || {})[0] || 'name'} already exists.`,
        );
      }
      throw error;
    }
  }

  // ───────────────────────────── Update ───────────────────────────────────────

  /**
   * Update an existing topic by ID.
   * If the name changes, the slug is regenerated.
   * @throws NotFoundException when no topic matches the given ID.
   */
  async update(id: string, dto: UpdateTopicDto): Promise<Topic> {
    this.logger.log({ msg: 'Updating topic', topicId: id, fields: Object.keys(dto) });

    const updatePayload: Record<string, unknown> = { ...dto };

    // Regenerate the slug when the name changes
    if (dto.name) {
      updatePayload.slug = this.generateSlug(dto.name);
    }

    const topic = await this.topicModel
      .findByIdAndUpdate(id, updatePayload, { new: true })
      .lean()
      .exec();

    if (!topic) {
      this.logger.warn({ msg: 'Topic not found for update', topicId: id });
      throw new NotFoundException(ERROR_MESSAGES.TOPIC_NOT_FOUND);
    }

    this.logger.log({
      msg: 'Topic updated successfully',
      topicId: id,
      slug: topic.slug,
    });

    // Invalidate the active-topics cache
    this.invalidateCache(TopicsService.CACHE_KEY_ACTIVE_TOPICS);

    return topic;
  }

  // ───────────────────────── Active topics (cached) ───────────────────────────

  /**
   * Return all active topics sorted by `sortOrder`.
   * Results are cached in memory with a 5-minute TTL for read performance.
   */
  async findActiveTopics(): Promise<Topic[]> {
    const cacheKey = TopicsService.CACHE_KEY_ACTIVE_TOPICS;
    const cached = this.getFromCache<Topic[]>(cacheKey);

    if (cached) {
      this.logger.log({ msg: 'Returning cached active topics', count: cached.length });
      return cached;
    }

    this.logger.log({ msg: 'Cache miss for active topics, querying database' });

    const topics = await this.topicModel
      .find({ isActive: true })
      .sort({ sortOrder: 1 })
      .lean()
      .exec();

    this.setCache(cacheKey, topics);

    this.logger.log({ msg: 'Active topics fetched and cached', count: topics.length });
    return topics;
  }

  // ──────────────────────── Validate topic IDs ────────────────────────────────

  /**
   * Check whether every ID in the given array corresponds to an existing topic.
   * Uses a single `$in` query for efficiency.
   */
  async validateTopicIds(ids: string[]): Promise<boolean> {
    if (ids.length === 0) {
      return true;
    }

    this.logger.log({ msg: 'Validating topic IDs', count: ids.length });

    const count = await this.topicModel.countDocuments({ _id: { $in: ids } }).exec();
    const allExist = count === ids.length;

    this.logger.log({
      msg: 'Topic ID validation result',
      requested: ids.length,
      found: count,
      allExist,
    });

    return allExist;
  }

  // ─────────────────────────── Private helpers ────────────────────────────────

  /**
   * Generate a URL-friendly slug from a topic name.
   * Converts to lowercase, replaces spaces and special characters with hyphens,
   * and collapses consecutive hyphens.
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /** Read an entry from the in-memory cache if it has not expired. */
  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) {
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  /** Write an entry to the in-memory cache with the default TTL. */
  private setCache<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + TopicsService.CACHE_TTL_MS,
    });
  }

  /** Remove a specific key from the cache. */
  private invalidateCache(key: string): void {
    this.cache.delete(key);
    this.logger.log({ msg: 'Cache invalidated', key });
  }
}
