import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { User, UserDocument } from '../../database/schemas/user.schema.js';
import { Topic, TopicDocument } from '../../database/schemas/topic.schema.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { UpdateSubscriptionsDto } from './dto/update-subscriptions.dto.js';
import { UpdateFcmTokenDto } from './dto/update-fcm-token.dto.js';
import { ERROR_MESSAGES } from '../../common/constants/index.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Topic.name) private readonly topicModel: Model<TopicDocument>,
    @InjectPinoLogger(UsersService.name) private readonly logger: PinoLogger,
  ) {}

  // ──────────────────────────── Find by ID ───────────────────────────────────

  /**
   * Find a user by ID. Excludes password field.
   * Uses lean() for read performance.
   */
  async findById(userId: string): Promise<User | null> {
    this.logger.info({ userId }, 'Finding user by ID');

    try {
      const user = await this.userModel
        .findById(userId)
        .lean()
        .exec();

      if (!user) {
        this.logger.warn({ userId }, 'User not found');
        return null;
      }

      this.logger.debug({ userId }, 'User found');
      return user;
    } catch (error) {
      this.logger.error({ err: error, userId }, 'Error finding user by ID');
      throw new InternalServerErrorException(ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
    }
  }

  // ──────────────────────────── Find by Email ────────────────────────────────

  /**
   * Find a user by email, including the password field (for auth).
   */
  async findByEmail(email: string): Promise<UserDocument | null> {
    this.logger.info({ email }, 'Finding user by email');

    try {
      const user = await this.userModel
        .findOne({ email: email.toLowerCase() })
        .select('+password')
        .exec();

      if (!user) {
        this.logger.warn({ email }, 'User not found by email');
        return null;
      }

      this.logger.debug({ email, userId: user._id }, 'User found by email');
      return user;
    } catch (error) {
      this.logger.error({ err: error, email }, 'Error finding user by email');
      throw new InternalServerErrorException(ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
    }
  }

  // ──────────────────────────── Get Profile ──────────────────────────────────

  /**
   * Get user profile with populated subscribed topics (name, slug, icon).
   */
  async getProfile(userId: string): Promise<User> {
    this.logger.info({ userId }, 'Fetching user profile');

    try {
      const user = await this.userModel
        .findById(userId)
        .populate({
          path: 'subscribedTopics',
          select: 'name slug icon',
        })
        .lean()
        .exec();

      if (!user) {
        this.logger.warn({ userId }, 'Profile not found');
        throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
      }

      this.logger.info({ userId }, 'Profile fetched successfully');
      return user;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error({ err: error, userId }, 'Error fetching profile');
      throw new InternalServerErrorException(ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
    }
  }

  // ──────────────────────────── Update Profile ───────────────────────────────

  /**
   * Partial update of user profile. Checks unique constraints for email/username.
   */
  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    this.logger.info(
      { userId, fields: Object.keys(dto) },
      'Updating user profile',
    );

    try {
      // Check unique constraints if email or username is being updated
      if (dto.email || dto.username) {
        const orConditions: Record<string, string>[] = [];

        if (dto.email) {
          orConditions.push({ email: dto.email.toLowerCase() });
        }
        if (dto.username) {
          orConditions.push({ username: dto.username.toLowerCase() });
        }

        const existing = await this.userModel
          .findOne({
            _id: { $ne: new Types.ObjectId(userId) },
            $or: orConditions,
          })
          .lean()
          .exec();

        if (existing) {
          const conflictField =
            dto.email && existing.email === dto.email.toLowerCase()
              ? 'email'
              : 'username';
          this.logger.warn(
            { userId, conflictField },
            'Profile update failed: duplicate field',
          );
          throw new ConflictException(
            `An account with this ${conflictField} already exists.`,
          );
        }
      }

      const updatePayload: Record<string, unknown> = {};
      if (dto.email) updatePayload.email = dto.email.toLowerCase();
      if (dto.username) updatePayload.username = dto.username.toLowerCase();

      const updatedUser = await this.userModel
        .findByIdAndUpdate(userId, { $set: updatePayload }, { new: true })
        .populate({
          path: 'subscribedTopics',
          select: 'name slug icon',
        })
        .lean()
        .exec();

      if (!updatedUser) {
        this.logger.warn({ userId }, 'User not found for profile update');
        throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
      }

      this.logger.info(
        { userId, updatedFields: Object.keys(updatePayload) },
        'Profile updated successfully',
      );

      return updatedUser;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }

      // Handle MongoDB duplicate key error
      if ((error as any)?.code === 11000) {
        this.logger.warn(
          { userId, keyPattern: (error as any).keyPattern },
          'Profile update failed: duplicate key error',
        );
        throw new ConflictException(
          'An account with this email or username already exists.',
        );
      }

      this.logger.error({ err: error, userId }, 'Error updating profile');
      throw new InternalServerErrorException(ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
    }
  }

  // ─────────────────────── Update Subscriptions ──────────────────────────────

  /**
   * Replace the user's topic subscriptions. Validates that all topic IDs exist.
   * Uses atomic $set operation.
   */
  async updateSubscriptions(
    userId: string,
    dto: UpdateSubscriptionsDto,
  ): Promise<User> {
    this.logger.info(
      { userId, topicCount: dto.topicIds.length },
      'Updating user subscriptions',
    );

    try {
      // Validate that all topic IDs actually exist
      if (dto.topicIds.length > 0) {
        const existingCount = await this.topicModel
          .countDocuments({ _id: { $in: dto.topicIds } })
          .exec();

        if (existingCount !== dto.topicIds.length) {
          this.logger.warn(
            {
              userId,
              requested: dto.topicIds.length,
              found: existingCount,
            },
            'Subscription update failed: invalid topic IDs',
          );
          throw new BadRequestException(ERROR_MESSAGES.INVALID_TOPIC_IDS);
        }
      }

      // Atomic $set operation to replace subscriptions
      const updatedUser = await this.userModel
        .findByIdAndUpdate(
          userId,
          { $set: { subscribedTopics: dto.topicIds.map((id) => new Types.ObjectId(id)) } },
          { new: true },
        )
        .populate({
          path: 'subscribedTopics',
          select: 'name slug icon',
        })
        .lean()
        .exec();

      if (!updatedUser) {
        this.logger.warn({ userId }, 'User not found for subscription update');
        throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
      }

      this.logger.info(
        { userId, topicIds: dto.topicIds },
        'Subscriptions updated successfully',
      );

      return updatedUser;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      this.logger.error({ err: error, userId }, 'Error updating subscriptions');
      throw new InternalServerErrorException(ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
    }
  }

  // ─────────────────────── Update FCM Token ──────────────────────────────────

  /**
   * Update the user's Firebase Cloud Messaging token for push notifications.
   */
  async updateFcmToken(userId: string, dto: UpdateFcmTokenDto): Promise<void> {
    this.logger.info({ userId }, 'Updating FCM token');

    try {
      const result = await this.userModel
        .findByIdAndUpdate(userId, { $set: { fcmToken: dto.fcmToken } })
        .lean()
        .exec();

      if (!result) {
        this.logger.warn({ userId }, 'User not found for FCM token update');
        throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
      }

      this.logger.info({ userId }, 'FCM token updated successfully');
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error({ err: error, userId }, 'Error updating FCM token');
      throw new InternalServerErrorException(ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
    }
  }

  // ─────────────────────── Update Streak ─────────────────────────────────────

  /**
   * Update the user's learning streak.
   * - If lastActiveDate was yesterday: increment the streak count.
   * - If lastActiveDate is today: no change (already counted).
   * - If gap is more than 1 day: reset streak to 1.
   */
  async updateStreak(userId: string): Promise<User> {
    this.logger.info({ userId }, 'Updating streak');

    try {
      const user = await this.userModel.findById(userId).lean().exec();

      if (!user) {
        this.logger.warn({ userId }, 'User not found for streak update');
        throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
      }

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const lastActive = user.streak?.lastActiveDate
        ? new Date(user.streak.lastActiveDate)
        : null;

      let newCount: number;

      if (!lastActive) {
        // First activity ever
        newCount = 1;
        this.logger.debug({ userId }, 'First activity, starting streak at 1');
      } else {
        const lastActiveDay = new Date(
          lastActive.getFullYear(),
          lastActive.getMonth(),
          lastActive.getDate(),
        );
        const diffMs = today.getTime() - lastActiveDay.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
          // Already active today, no change
          this.logger.debug({ userId, count: user.streak.count }, 'Already active today, no streak change');
          return user;
        } else if (diffDays === 1) {
          // Yesterday was last active day, increment
          newCount = user.streak.count + 1;
          this.logger.debug({ userId, newCount }, 'Consecutive day, incrementing streak');
        } else {
          // Gap > 1 day, reset streak
          newCount = 1;
          this.logger.debug({ userId, gapDays: diffDays }, 'Streak broken, resetting to 1');
        }
      }

      const updatedUser = await this.userModel
        .findByIdAndUpdate(
          userId,
          {
            $set: {
              'streak.count': newCount,
              'streak.lastActiveDate': today,
            },
          },
          { new: true },
        )
        .lean()
        .exec();

      this.logger.info(
        { userId, newCount, date: today.toISOString() },
        'Streak updated successfully',
      );

      if (!updatedUser) {
        this.logger.error({ userId }, 'User disappeared during streak update');
        throw new InternalServerErrorException(ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
      }
      return updatedUser;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error({ err: error, userId }, 'Error updating streak');
      throw new InternalServerErrorException(ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
    }
  }

  // ─────────────────── Get Subscribed Users ──────────────────────────────────

  /**
   * Find all active users subscribed to a given topic who have FCM tokens.
   * Used for sending push notifications.
   */
  async getSubscribedUsers(
    topicId: string,
  ): Promise<Pick<User, 'email' | 'username' | 'fcmToken'>[]> {
    this.logger.info({ topicId }, 'Fetching users subscribed to topic');

    try {
      const users = await this.userModel
        .find({
          subscribedTopics: new Types.ObjectId(topicId),
          isActive: true,
          fcmToken: { $ne: null, $exists: true },
        })
        .select('email username fcmToken')
        .lean()
        .exec();

      this.logger.info(
        { topicId, userCount: users.length },
        'Subscribed users fetched',
      );

      return users;
    } catch (error) {
      this.logger.error(
        { err: error, topicId },
        'Error fetching subscribed users',
      );
      throw new InternalServerErrorException(ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
    }
  }
}
