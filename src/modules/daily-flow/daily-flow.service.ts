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
import { ProgressService } from '../progress/progress.service.js';
import { DailyFeedItemDto } from './dto/daily-feed-item.dto.js';
import { DailyStatsDto } from './dto/daily-stats.dto.js';
import { SUBSCRIPTION_PLANS } from '../../common/constants/index.js';

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
 * - Selects a question per active topic (for admin stats / DailySelection records)
 * - Sends one personalized push notification per user
 * - Provides personalized daily feeds via ProgressService
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
    private readonly progressService: ProgressService,
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
   * Main daily flow orchestration. Runs at 8 PM every day.
   *
   * Steps:
   * 1. Fetch all active topics
   * 2. Select a question for each topic (least recently used) for admin stats
   * 3. Verify AI answers exist for selected questions
   * 4. Create DailySelection records (idempotent via upsert)
   * 5. Send ONE personalized push notification per user (all topics done first)
   * 6. Log summary
   *
   * Note: The personalized question per user is computed on-demand in getDailyFeed().
   * Notifications are sent once per user (not per topic) with `{name}` placeholder.
   */
  @Cron('0 20 * * *')
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

          // ── Step 2: Select a daily question (for admin stats) ────────
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

          this.logger.log({
            msg: 'DailySelection record ensured',
            date: today,
            topicId: topicId.toString(),
          });

          summary.topicsProcessed++;

          this.logger.log({
            msg: 'Topic processing complete',
            topicName: topic.name,
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

      // ── Step 5: Send ONE personalized notification per user ────────────
      try {
        const payload = {
          title: '🔥 StackDaily',
          body: 'Hey {name}, your daily question is ready! Keep the streak going 🚀',
        };

        const sendResult =
          await this.notificationsService.sendDailyNotificationsToAll(payload);
        summary.notificationsSent = sendResult.sent;
      } catch (notificationError: any) {
        this.logger.error({
          msg: 'Failed to send daily notifications',
          error: notificationError.message,
        });
        summary.errors++;
      }

      // ── Step 6: Log summary ────────────────────────────────────────────
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
   * Retrieve the current user's personalized daily learning feed.
   *
   * For each subscribed topic, uses ProgressService to determine the next
   * question based on the user's progress (difficulty-sorted: beginner →
   * intermediate → advanced). Looks up AI answers and topic metadata.
   */
  async getDailyFeed(userId: string): Promise<DailyFeedItemDto[]> {
    this.logger.log({
      msg: 'Retrieving personalized daily feed',
      userId,
    });

    // Get user's subscribed topics and subscription plan
    const user = await this.userModel
      .findById(userId)
      .select('subscribedTopics subscription')
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

    // ── Enforce free-tier feed limit ────────────────────────────────────
    const userPlan = (user as any).subscription?.plan || 'free';
    const planConfig = SUBSCRIPTION_PLANS[userPlan as keyof typeof SUBSCRIPTION_PLANS];
    let feedTopicIds = subscribedTopicIds;

    if (
      planConfig.maxTopics !== null &&
      subscribedTopicIds.length > planConfig.maxTopics
    ) {
      feedTopicIds = subscribedTopicIds.slice(0, planConfig.maxTopics);
      this.logger.log({
        msg: 'Feed restricted to plan limit',
        userId,
        plan: userPlan,
        totalTopics: subscribedTopicIds.length,
        feedTopics: feedTopicIds.length,
      });
    }

    // ── Batch-fetch topic details upfront (avoids N+1) ──────────────────
    const topicDocs = await this.topicModel
      .find({ _id: { $in: feedTopicIds } })
      .select('name slug icon')
      .lean()
      .exec();

    const topicMap = new Map(
      topicDocs.map((t) => [t._id.toString(), t]),
    );

    // ── Build personalized feed per topic (in parallel) ──────────────────
    const feedItems = await Promise.all(
      feedTopicIds.map(async (topicId) => {
        const topicIdStr = topicId.toString();

        try {
          // Get the next question for this user in this topic
          const { question, progress } =
            await this.progressService.getNextQuestion(userId, topicIdStr);

          if (!question) {
            return null; // No questions available for this topic
          }

          const questionId = (question as any)._id;

          // Look up AI answer for this question
          const aiAnswer = await this.aiAnswerModel
            .findOne({ questionId })
            .lean()
            .exec();

          // Get topic from pre-fetched map
          const topic = topicMap.get(topicIdStr);
          if (!topic) {
            return null;
          }

          // Get total question count for progress calculation
          const totalQuestions =
            await this.progressService.countActiveQuestions(topicIdStr);

          // Use a stable ID for the feed item (progress record ID)
          const feedItemId = (progress as any)._id?.toString() || topicIdStr;

          return {
            dailySelectionId: feedItemId,
            topic: {
              _id: topicIdStr,
              name: topic.name,
              slug: topic.slug,
              icon: (topic as any).icon || null,
            },
            question: {
              text: (question as any).text,
              difficulty: (question as any).difficulty,
              tags: (question as any).tags || [],
            },
            answer: {
              content: aiAnswer?.answer || '',
              generatedAt: aiAnswer?.generatedAt || null,
              mcqs: aiAnswer?.mcqs || [],
            },
            progress: {
              status: progress.status,
              questionsAnswered: progress.questionsAnswered,
              totalQuestions,
              currentDifficulty: (question as any).difficulty,
            },
          } as DailyFeedItemDto;
        } catch (error: any) {
          this.logger.error({
            msg: 'Error building feed item for topic',
            userId,
            topicId: topicIdStr,
            error: error.message,
          });
          return null;
        }
      }),
    );

    // Filter out null items (topics with no questions or errors)
    const validFeedItems = feedItems.filter(
      (item): item is DailyFeedItemDto => item !== null,
    );

    this.logger.log({
      msg: 'Personalized daily feed retrieved',
      userId,
      itemCount: validFeedItems.length,
    });

    return validFeedItems;
  }

  // ──────────────────────────── Mark as Read ─────────────────────────────────

  /**
   * Mark a daily question as read, advance the user's progress, and update streak.
   *
   * Streak logic:
   * - If lastActiveDate is yesterday: increment streak count
   * - If lastActiveDate is today: no change (already counted)
   * - Otherwise (gap or null): reset streak to 1
   */
  async markAsRead(
    userId: string,
    _dailySelectionId: string,
    topicId: string,
  ): Promise<void> {
    const today = this.getTodayDate();
    const yesterday = this.getYesterdayDate();

    this.logger.log({
      msg: 'Marking daily content as read',
      userId,
      topicId,
    });

    // Advance the user's progress for this topic
    await this.progressService.advanceProgress(userId, topicId);

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

    const currentMax = user.streak?.maxStreak ?? 0;
    const newMax = Math.max(currentMax, newCount);

    await this.userModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(userId) },
        {
          $set: {
            'streak.count': newCount,
            'streak.maxStreak': newMax,
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
      maxStreak: newMax,
      date: today,
    });
  }

  // ──────────────────── Reset Stale Streaks Cron ─────────────────────────────

  /**
   * Runs at midnight daily. Resets streaks for users who have not been
   * active since yesterday (1 missed day = streak reset).
   */
  @Cron('0 0 * * *')
  async resetStaleStreaks(): Promise<void> {
    this.logger.log({ msg: 'Starting stale streak reset' });

    const yesterdayStart = new Date();
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);

    const result = await this.userModel
      .updateMany(
        {
          'streak.lastActiveDate': { $lt: yesterdayStart },
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
