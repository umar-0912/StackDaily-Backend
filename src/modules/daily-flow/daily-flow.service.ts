import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron } from '@nestjs/schedule';

import {
  DailySelection,
  DailySelectionDocument,
} from '../../database/schemas/daily-selection.schema.js';
import { Topic, TopicDocument } from '../../database/schemas/topic.schema.js';
import { User, UserDocument } from '../../database/schemas/user.schema.js';
import {
  Question,
  QuestionDocument,
} from '../../database/schemas/question.schema.js';
import {
  AiAnswer,
  AiAnswerDocument,
} from '../../database/schemas/ai-answer.schema.js';

import { NotificationsService } from '../notifications/notifications.service.js';
import { DailyFeedItemDto } from './dto/daily-feed-item.dto.js';
import { DailyStatsDto } from './dto/daily-stats.dto.js';

/**
 * Summary object logged at the end of the daily flow.
 */
interface FlowSummary {
  topicsProcessed: number;
  questionsSelected: number;
  notificationsSent: number;
  errors: number;
  durationMs: number;
}

/**
 * Service orchestrating the daily learning flow:
 * - Selects a question per active topic
 * - Verifies AI answers exist
 * - Creates DailySelection records (idempotent)
 * - Sends push notifications to subscribed users
 * - Manages user streaks
 */
@Injectable()
export class DailyFlowService {
  private readonly logger = new Logger(DailyFlowService.name);

  constructor(
    @InjectModel(DailySelection.name)
    private readonly dailySelectionModel: Model<DailySelectionDocument>,
    @InjectModel(Topic.name)
    private readonly topicModel: Model<TopicDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Question.name)
    private readonly questionModel: Model<QuestionDocument>,
    @InjectModel(AiAnswer.name)
    private readonly aiAnswerModel: Model<AiAnswerDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ──────────────────────────── Helpers ─────────────────────────────────────

  /**
   * Returns today's date in YYYY-MM-DD format.
   */
  getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Returns yesterday's date in YYYY-MM-DD format.
   */
  private getYesterdayDate(): string {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  }

  // ──────────────────────── Daily Flow Cron ─────────────────────────────────

  /**
   * Main daily flow orchestration. Runs at 5 AM every day.
   *
   * Steps:
   * 1. Fetch all active topics
   * 2. Select a question for each topic (least recently used)
   * 3. Verify AI answers exist for selected questions
   * 4. Create DailySelection records (idempotent via upsert)
   * 5. Find subscribed users with FCM tokens per topic
   * 6. Send push notifications in batches
   * 7. Log summary
   *
   * Each topic is processed independently; one topic failing does not block others.
   */
  @Cron('0 5 * * *')
  async runDailyFlow(): Promise<void> {
    const startTime = Date.now();
    const today = this.getTodayDate();

    const summary: FlowSummary = {
      topicsProcessed: 0,
      questionsSelected: 0,
      notificationsSent: 0,
      errors: 0,
      durationMs: 0,
    };

    this.logger.log({
      msg: 'Starting daily flow orchestration',
      date: today,
    });

    try {
      // ── Step 1: Get all active topics ──────────────────────────────────
      const activeTopics = await this.topicModel
        .find({ isActive: true })
        .sort({ sortOrder: 1 })
        .lean()
        .exec();

      this.logger.log({
        msg: 'Active topics retrieved',
        count: activeTopics.length,
      });

      if (activeTopics.length === 0) {
        this.logger.warn('No active topics found, skipping daily flow');
        return;
      }

      // ── Process each topic independently ───────────────────────────────
      for (const topic of activeTopics) {
        try {
          const topicId = (topic as { _id: Types.ObjectId })._id;

          // ── Step 2: Select a daily question ────────────────────────────
          // Prefer questions with null lastUsedDate (never used), then oldest.
          // Atomic findOneAndUpdate to claim the question and prevent races.
          const selectedQuestion = await this.questionModel
            .findOneAndUpdate(
              {
                topicId,
                isActive: true,
              },
              {
                $set: { lastUsedDate: new Date() },
                $inc: { usageCount: 1 },
              },
              {
                new: false, // return the doc before update for logging original state
                sort: { lastUsedDate: 1 }, // null sorts first in ascending
                lean: true,
              },
            )
            .exec();

          if (!selectedQuestion) {
            this.logger.warn({
              msg: 'No active questions available for topic',
              topicId: topicId.toString(),
              topicName: topic.name,
            });
            summary.errors++;
            continue;
          }

          const questionId = selectedQuestion._id as Types.ObjectId;
          summary.questionsSelected++;

          this.logger.log({
            msg: 'Question selected for topic',
            topicId: topicId.toString(),
            topicName: topic.name,
            questionId: questionId.toString(),
            previousLastUsedDate: selectedQuestion.lastUsedDate,
          });

          // ── Step 3: Ensure AI answer exists ────────────────────────────
          const aiAnswer = await this.aiAnswerModel
            .findOne({ questionId })
            .lean()
            .exec();

          let aiAnswerId: Types.ObjectId | undefined;

          if (!aiAnswer) {
            this.logger.warn({
              msg: 'AI answer not found for selected question; nightly pre-generation may have missed it',
              questionId: questionId.toString(),
              topicName: topic.name,
            });
          } else {
            aiAnswerId = (aiAnswer as { _id: Types.ObjectId })._id;
            this.logger.log({
              msg: 'AI answer verified for question',
              questionId: questionId.toString(),
              aiAnswerId: aiAnswerId.toString(),
            });
          }

          // ── Step 4: Create DailySelection record (idempotent) ──────────
          await this.dailySelectionModel.bulkWrite([
            {
              updateOne: {
                filter: { date: today, topicId },
                update: {
                  $setOnInsert: {
                    date: today,
                    topicId,
                    questionId,
                    ...(aiAnswerId ? { aiAnswerId } : {}),
                    notificationsSent: 0,
                  },
                },
                upsert: true,
              },
            },
          ]);

          // Retrieve the daily selection (whether just created or already existed)
          const dailySelection = await this.dailySelectionModel
            .findOne({ date: today, topicId })
            .lean()
            .exec();

          if (!dailySelection) {
            this.logger.error({
              msg: 'Failed to retrieve daily selection after upsert',
              date: today,
              topicId: topicId.toString(),
            });
            summary.errors++;
            continue;
          }

          const dailySelectionId = (dailySelection as any)._id as Types.ObjectId;

          this.logger.log({
            msg: 'DailySelection record ensured',
            dailySelectionId: dailySelectionId.toString(),
            date: today,
            topicId: topicId.toString(),
          });

          // ── Step 5+6: Send notifications via NotificationsService ───
          const questionPreview =
            selectedQuestion.text.length > 100
              ? selectedQuestion.text.substring(0, 100) + '...'
              : selectedQuestion.text;

          const payload = {
            title: `Daily ${topic.name} Question`,
            body: questionPreview,
            data: {
              dailySelectionId: dailySelectionId.toString(),
              topicId: topicId.toString(),
            },
          };

          let topicNotificationsSent = 0;

          try {
            const sendResult = await this.notificationsService.sendDailyNotifications(
              topicId.toString(),
              dailySelectionId.toString(),
              payload,
            );
            topicNotificationsSent = sendResult.sent;
          } catch (notificationError: any) {
            this.logger.error({
              msg: 'Failed to send notifications for topic',
              topicName: topic.name,
              error: notificationError.message,
            });
            summary.errors++;
          }

          // Update the notificationsSent count on the daily selection
          await this.dailySelectionModel
            .updateOne(
              { _id: dailySelectionId },
              { $inc: { notificationsSent: topicNotificationsSent } },
            )
            .exec();

          summary.notificationsSent += topicNotificationsSent;
          summary.topicsProcessed++;

          this.logger.log({
            msg: 'Topic processing complete',
            topicName: topic.name,
            notificationsSent: topicNotificationsSent,
          });
        } catch (topicError: any) {
          this.logger.error({
            msg: 'Error processing topic',
            topicName: topic.name,
            topicId: (topic as any)._id?.toString(),
            error: topicError.message,
            stack: topicError.stack,
          });
          summary.errors++;
        }
      }

      // ── Step 7: Log summary ────────────────────────────────────────────
      summary.durationMs = Date.now() - startTime;

      this.logger.log({
        msg: 'Daily flow orchestration completed',
        ...summary,
      });
    } catch (error: any) {
      this.logger.error({
        msg: 'Critical error in daily flow orchestration',
        error: error.message,
        stack: error.stack,
        durationMs: Date.now() - startTime,
      });
    }
  }

  // ──────────────────────────── Daily Feed ───────────────────────────────────

  /**
   * Retrieve the current user's daily learning feed.
   *
   * Uses a single aggregation pipeline with $lookup to avoid N+1 queries:
   * - Matches today's DailySelection records for the user's subscribed topics
   * - Joins questions, ai_answers, and topics collections
   * - Projects the final feed shape
   */
  async getDailyFeed(userId: string): Promise<DailyFeedItemDto[]> {
    const today = this.getTodayDate();

    this.logger.log({
      msg: 'Retrieving daily feed',
      userId,
      date: today,
    });

    // Get user's subscribed topics
    const user = await this.userModel
      .findById(userId)
      .select('subscribedTopics')
      .lean()
      .exec();

    if (!user) {
      this.logger.warn({ msg: 'User not found for daily feed', userId });
      throw new NotFoundException('User not found');
    }

    if (!user.subscribedTopics || user.subscribedTopics.length === 0) {
      this.logger.log({
        msg: 'User has no subscribed topics, returning empty feed',
        userId,
      });
      return [];
    }

    const subscribedTopicIds = user.subscribedTopics;

    // Single aggregation pipeline: DailySelection -> Question -> AiAnswer -> Topic
    const feedItems = await this.dailySelectionModel
      .aggregate([
        // Match today's selections for the user's subscribed topics
        {
          $match: {
            date: today,
            topicId: { $in: subscribedTopicIds },
          },
        },

        // Join the questions collection
        {
          $lookup: {
            from: 'questions',
            localField: 'questionId',
            foreignField: '_id',
            as: 'questionDoc',
          },
        },
        { $unwind: { path: '$questionDoc', preserveNullAndEmptyArrays: true } },

        // Join the ai_answers collection
        {
          $lookup: {
            from: 'aianswers',
            localField: 'questionId',
            foreignField: 'questionId',
            as: 'answerDoc',
          },
        },
        { $unwind: { path: '$answerDoc', preserveNullAndEmptyArrays: true } },

        // Join the topics collection
        {
          $lookup: {
            from: 'topics',
            localField: 'topicId',
            foreignField: '_id',
            as: 'topicDoc',
          },
        },
        { $unwind: { path: '$topicDoc', preserveNullAndEmptyArrays: true } },

        // Project final shape
        {
          $project: {
            _id: 0,
            dailySelectionId: { $toString: '$_id' },
            topic: {
              name: '$topicDoc.name',
              slug: '$topicDoc.slug',
              icon: { $ifNull: ['$topicDoc.icon', null] },
            },
            question: {
              text: '$questionDoc.text',
              difficulty: '$questionDoc.difficulty',
              tags: { $ifNull: ['$questionDoc.tags', []] },
            },
            answer: {
              content: { $ifNull: ['$answerDoc.answer', ''] },
              generatedAt: { $ifNull: ['$answerDoc.generatedAt', null] },
            },
          },
        },
      ])
      .exec();

    this.logger.log({
      msg: 'Daily feed retrieved',
      userId,
      itemCount: feedItems.length,
    });

    return feedItems as DailyFeedItemDto[];
  }

  // ──────────────────────────── Mark as Read ─────────────────────────────────

  /**
   * Mark a daily selection as read and update the user's streak.
   *
   * Streak logic:
   * - If lastActiveDate is yesterday: increment streak count
   * - If lastActiveDate is today: no change (already counted)
   * - Otherwise (gap or null): reset streak to 1
   *
   * Uses findOneAndUpdate for atomicity.
   */
  async markAsRead(userId: string, dailySelectionId: string): Promise<void> {
    const today = this.getTodayDate();
    const yesterday = this.getYesterdayDate();

    this.logger.log({
      msg: 'Marking daily content as read',
      userId,
      dailySelectionId,
    });

    // Verify the daily selection exists
    const dailySelection = await this.dailySelectionModel
      .findById(dailySelectionId)
      .lean()
      .exec();

    if (!dailySelection) {
      this.logger.warn({
        msg: 'Daily selection not found',
        dailySelectionId,
      });
      throw new NotFoundException('Daily selection not found');
    }

    // Get current user streak state
    const user = await this.userModel
      .findById(userId)
      .select('streak')
      .lean()
      .exec();

    if (!user) {
      this.logger.warn({ msg: 'User not found for streak update', userId });
      throw new NotFoundException('User not found');
    }

    const lastActiveDate = user.streak?.lastActiveDate
      ? new Date(user.streak.lastActiveDate).toISOString().split('T')[0]
      : null;

    let newCount: number;

    if (lastActiveDate === today) {
      // Already active today, no streak change needed
      this.logger.log({
        msg: 'User already active today, no streak change',
        userId,
        currentStreak: user.streak?.count ?? 0,
      });
      return;
    } else if (lastActiveDate === yesterday) {
      // Consecutive day: increment streak
      newCount = (user.streak?.count ?? 0) + 1;
    } else {
      // Gap in activity (or first ever): reset to 1
      newCount = 1;
    }

    await this.userModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(userId) },
        {
          $set: {
            'streak.count': newCount,
            'streak.lastActiveDate': new Date(today),
          },
        },
      )
      .exec();

    this.logger.log({
      msg: 'User streak updated',
      userId,
      previousLastActiveDate: lastActiveDate,
      newStreak: newCount,
      date: today,
    });
  }

  // ──────────────────── Reset Stale Streaks Cron ─────────────────────────────

  /**
   * Runs at midnight daily. Resets streaks for users who have not been
   * active in the last 2 days and still have a positive streak count.
   */
  @Cron('0 0 * * *')
  async resetStaleStreaks(): Promise<void> {
    this.logger.log({ msg: 'Starting stale streak reset' });

    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    twoDaysAgo.setHours(0, 0, 0, 0);

    const result = await this.userModel
      .updateMany(
        {
          'streak.lastActiveDate': { $lt: twoDaysAgo },
          'streak.count': { $gt: 0 },
        },
        {
          $set: { 'streak.count': 0 },
        },
      )
      .exec();

    this.logger.log({
      msg: 'Stale streak reset completed',
      usersReset: result.modifiedCount,
    });
  }

  // ──────────────────────────── Daily Stats ──────────────────────────────────

  /**
   * Retrieve statistics for a given date (defaults to today).
   *
   * Returns the number of topics with content, total notifications sent,
   * and a per-topic breakdown with question text and notification counts.
   */
  async getDailyStats(date?: string): Promise<DailyStatsDto> {
    const targetDate = date || this.getTodayDate();

    this.logger.log({
      msg: 'Retrieving daily stats',
      date: targetDate,
    });

    const statsAggregation = await this.dailySelectionModel
      .aggregate([
        { $match: { date: targetDate } },

        // Join questions
        {
          $lookup: {
            from: 'questions',
            localField: 'questionId',
            foreignField: '_id',
            as: 'questionDoc',
          },
        },
        {
          $unwind: { path: '$questionDoc', preserveNullAndEmptyArrays: true },
        },

        // Join topics
        {
          $lookup: {
            from: 'topics',
            localField: 'topicId',
            foreignField: '_id',
            as: 'topicDoc',
          },
        },
        { $unwind: { path: '$topicDoc', preserveNullAndEmptyArrays: true } },

        // Group to build stats
        {
          $group: {
            _id: null,
            topicsWithContent: { $sum: 1 },
            totalNotificationsSent: { $sum: '$notificationsSent' },
            breakdown: {
              $push: {
                topicName: { $ifNull: ['$topicDoc.name', 'Unknown'] },
                questionText: {
                  $ifNull: ['$questionDoc.text', 'No question'],
                },
                notificationsSent: '$notificationsSent',
              },
            },
          },
        },

        // Project final shape
        {
          $project: {
            _id: 0,
            topicsWithContent: 1,
            totalNotificationsSent: 1,
            breakdown: 1,
          },
        },
      ])
      .exec();

    const stats =
      statsAggregation.length > 0
        ? statsAggregation[0]
        : { topicsWithContent: 0, totalNotificationsSent: 0, breakdown: [] };

    const result: DailyStatsDto = {
      date: targetDate,
      topicsWithContent: stats.topicsWithContent,
      totalNotificationsSent: stats.totalNotificationsSent,
      breakdown: stats.breakdown,
    };

    this.logger.log({
      msg: 'Daily stats retrieved',
      date: targetDate,
      topicsWithContent: result.topicsWithContent,
      totalNotificationsSent: result.totalNotificationsSent,
    });

    return result;
  }

  // ──────────────────────── Manual Trigger ────────────────────────────────────

  /**
   * Manually trigger the daily flow. Intended for the ops team
   * to re-run or catch up if the cron missed.
   */
  async triggerDailyFlow(): Promise<void> {
    this.logger.log({ msg: 'Manual daily flow triggered' });
    await this.runDailyFlow();
  }
}
