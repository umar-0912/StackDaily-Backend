import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  UserTopicProgress,
  UserTopicProgressDocument,
  ProgressStatus,
} from '../../database/schemas/user-topic-progress.schema.js';
import {
  Question,
  QuestionDocument,
} from '../../database/schemas/question.schema.js';
import { Topic, TopicDocument } from '../../database/schemas/topic.schema.js';

@Injectable()
export class ProgressService {
  private readonly logger = new Logger(ProgressService.name);

  constructor(
    @InjectModel(UserTopicProgress.name)
    private readonly progressModel: Model<UserTopicProgressDocument>,
    @InjectModel(Question.name)
    private readonly questionModel: Model<QuestionDocument>,
    @InjectModel(Topic.name)
    private readonly topicModel: Model<TopicDocument>,
  ) {}

  // ──────────────────── Get or Create Progress ───────────────────────────

  /**
   * Find existing UserTopicProgress for a user+topic, or create one
   * with status 'not_started'.
   */
  async getOrCreateProgress(
    userId: string,
    topicId: string,
  ): Promise<UserTopicProgressDocument> {
    // Atomic upsert to avoid race conditions when two requests hit simultaneously
    const progress = await this.progressModel
      .findOneAndUpdate(
        {
          userId: new Types.ObjectId(userId),
          topicId: new Types.ObjectId(topicId),
        },
        {
          $setOnInsert: {
            userId: new Types.ObjectId(userId),
            topicId: new Types.ObjectId(topicId),
            status: ProgressStatus.NOT_STARTED,
            currentQuestionIndex: 0,
            questionsAnswered: 0,
            lastQuestionDate: null,
            lastQuestionId: null,
            startedAt: null,
            completedAt: null,
          },
        },
        { upsert: true, new: true },
      )
      .exec();

    return progress!;
  }

  // ──────────────────── Get Next Question ─────────────────────────────────

  /**
   * Get the next question for a user in a topic based on their progress.
   * Questions are ordered by difficulty (beginner → intermediate → advanced),
   * then by creation date within each difficulty level.
   *
   * If lastQuestionDate is today, returns the cached lastQuestionId (idempotent).
   * If all questions are completed, restarts the cycle from index 0.
   */
  async getNextQuestion(
    userId: string,
    topicId: string,
  ): Promise<{
    question: Record<string, unknown> | null;
    progress: UserTopicProgressDocument;
  }> {
    const today = new Date().toISOString().split('T')[0];
    const progress = await this.getOrCreateProgress(userId, topicId);

    // Idempotent: if already served today (or already read today), return the cached question.
    // After mark-read, lastQuestionDate becomes "YYYY-MM-DD:read" but we still want to
    // return the same question for the rest of the day.
    const servedToday =
      progress.lastQuestionDate === today ||
      progress.lastQuestionDate === `${today}:read`;

    if (servedToday && progress.lastQuestionId) {
      const cachedQuestion = await this.questionModel
        .findById(progress.lastQuestionId)
        .lean()
        .exec();

      if (cachedQuestion) {
        this.logger.debug({
          msg: 'Returning cached question for today',
          userId,
          topicId,
          questionId: progress.lastQuestionId.toString(),
        });
        return { question: cachedQuestion as unknown as Record<string, unknown>, progress };
      }
    }

    // Query the question at currentQuestionIndex using difficulty-sorted order
    let question = await this.getQuestionAtIndex(
      topicId,
      progress.currentQuestionIndex,
    );

    // If no question found, cycle has completed — restart from index 0
    if (!question) {
      const totalQuestions = await this.countActiveQuestions(topicId);

      if (totalQuestions === 0) {
        this.logger.warn({
          msg: 'No active questions found for topic',
          userId,
          topicId,
        });
        return { question: null, progress };
      }

      // Mark as completed, then restart
      progress.status = ProgressStatus.COMPLETED;
      progress.completedAt = new Date();
      progress.currentQuestionIndex = 0;
      await progress.save();

      this.logger.log({
        msg: 'Topic cycle completed, restarting from beginning',
        userId,
        topicId,
        questionsAnswered: progress.questionsAnswered,
      });

      question = await this.getQuestionAtIndex(topicId, 0);

      if (!question) {
        return { question: null, progress };
      }
    }

    // Update progress
    const isFirstQuestion =
      progress.status === ProgressStatus.NOT_STARTED ||
      (progress.status === ProgressStatus.COMPLETED &&
        progress.currentQuestionIndex === 0);

    progress.lastQuestionDate = today;
    progress.lastQuestionId = (question as any)._id;

    if (isFirstQuestion) {
      progress.status = ProgressStatus.IN_PROGRESS;
      progress.startedAt = new Date();
      progress.completedAt = null;
    }

    await progress.save();

    this.logger.log({
      msg: 'Next question served',
      userId,
      topicId,
      questionIndex: progress.currentQuestionIndex,
      questionId: ((question as any)._id).toString(),
      difficulty: (question as any).difficulty,
    });

    return { question: question as Record<string, unknown>, progress };
  }

  // ──────────────────── Advance Progress ──────────────────────────────────

  /**
   * Advance the user's progress after they mark a question as read.
   * Increments currentQuestionIndex and questionsAnswered.
   * Checks if topic is completed (all questions answered).
   */
  async advanceProgress(
    userId: string,
    topicId: string,
  ): Promise<UserTopicProgressDocument> {
    const today = new Date().toISOString().split('T')[0];

    // Atomic: only advance if a question was served today (lastQuestionDate === today)
    // and hasn't already been marked as read (lastQuestionDate becomes "YYYY-MM-DD:read"
    // after advance). This prevents double-tap from skipping a question.
    const updated = await this.progressModel
      .findOneAndUpdate(
        {
          userId: new Types.ObjectId(userId),
          topicId: new Types.ObjectId(topicId),
          lastQuestionDate: today, // Must match exactly — not "today:read"
        },
        {
          $inc: { currentQuestionIndex: 1, questionsAnswered: 1 },
          $set: { lastQuestionDate: `${today}:read` },
        },
        { new: true },
      )
      .exec();

    if (!updated) {
      this.logger.warn({
        msg: 'Advance skipped: no unread question served today (likely double-tap)',
        userId,
        topicId,
      });
      // Return current state without changes
      return this.getOrCreateProgress(userId, topicId);
    }

    // Check if topic is now completed
    const totalQuestions = await this.countActiveQuestions(topicId);
    if (updated.currentQuestionIndex >= totalQuestions) {
      updated.status = ProgressStatus.COMPLETED;
      updated.completedAt = new Date();
      await updated.save();

      this.logger.log({
        msg: 'User completed all questions in topic',
        userId,
        topicId,
        questionsAnswered: updated.questionsAnswered,
        totalQuestions,
      });
    }

    this.logger.log({
      msg: 'Progress advanced',
      userId,
      topicId,
      newIndex: updated.currentQuestionIndex,
      questionsAnswered: updated.questionsAnswered,
      totalQuestions,
      status: updated.status,
    });

    return updated;
  }

  // ──────────────────── Get User Progress ─────────────────────────────────

  /**
   * Get progress for all of a user's subscribed topics.
   * Joins with topics for names and counts total questions per topic.
   */
  async getUserProgress(userId: string) {
    const progressRecords = await this.progressModel
      .find({ userId: new Types.ObjectId(userId) })
      .populate({
        path: 'topicId',
        select: 'name slug icon',
      })
      .lean()
      .exec();

    // Get total question counts for all topics in one query
    const topicIds = progressRecords.map((p) => p.topicId);
    const topicObjectIds = progressRecords.map(
      (p) => new Types.ObjectId(((p as any).topicId as any)?._id || p.topicId),
    );

    const questionCounts = await this.questionModel
      .aggregate([
        { $match: { topicId: { $in: topicObjectIds }, isActive: true } },
        { $group: { _id: '$topicId', count: { $sum: 1 } } },
      ])
      .exec();

    const countMap = new Map(
      questionCounts.map((c) => [c._id.toString(), c.count as number]),
    );

    return progressRecords.map((record) => {
      const topic = (record as any).topicId;
      const topicIdStr = topic?._id?.toString() || '';
      const totalQuestions = countMap.get(topicIdStr) || 0;
      // Cap at 100% — questionsAnswered can exceed totalQuestions after cycle restart
      const percentComplete =
        totalQuestions > 0
          ? Math.min(100, Math.round((record.questionsAnswered / totalQuestions) * 100))
          : 0;

      return {
        _id: (record as any)._id.toString(),
        topic: {
          _id: topicIdStr,
          name: topic?.name || '',
          slug: topic?.slug || '',
          icon: topic?.icon || null,
        },
        status: record.status,
        currentQuestionIndex: record.currentQuestionIndex,
        questionsAnswered: record.questionsAnswered,
        totalQuestions,
        currentDifficulty: this.getDifficultyAtIndex(
          record.currentQuestionIndex,
          totalQuestions,
        ),
        percentComplete,
        startedAt: record.startedAt,
        completedAt: record.completedAt,
      };
    });
  }

  /**
   * Get progress for a specific user + topic.
   */
  async getTopicProgress(userId: string, topicId: string) {
    const progress = await this.getOrCreateProgress(userId, topicId);
    const totalQuestions = await this.countActiveQuestions(topicId);

    const topic = await this.topicModel
      .findById(topicId)
      .select('name slug icon')
      .lean()
      .exec();

    // Cap at 100% — questionsAnswered can exceed totalQuestions after cycle restart
    const percentComplete =
      totalQuestions > 0
        ? Math.min(100, Math.round((progress.questionsAnswered / totalQuestions) * 100))
        : 0;

    return {
      _id: (progress as any)._id.toString(),
      topic: {
        _id: topicId,
        name: topic?.name || '',
        slug: topic?.slug || '',
        icon: (topic as any)?.icon || null,
      },
      status: progress.status,
      currentQuestionIndex: progress.currentQuestionIndex,
      questionsAnswered: progress.questionsAnswered,
      totalQuestions,
      currentDifficulty: this.getDifficultyAtIndex(
        progress.currentQuestionIndex,
        totalQuestions,
      ),
      percentComplete,
      startedAt: progress.startedAt,
      completedAt: progress.completedAt,
    };
  }

  // ──────────────────── Bulk Create Progress Records ─────────────────────

  /**
   * Create progress records for new topic subscriptions.
   * Skips topics that already have progress records (idempotent).
   */
  async ensureProgressRecords(
    userId: string,
    topicIds: string[],
  ): Promise<void> {
    const userObjectId = new Types.ObjectId(userId);

    const existing = await this.progressModel
      .find({
        userId: userObjectId,
        topicId: { $in: topicIds.map((id) => new Types.ObjectId(id)) },
      })
      .select('topicId')
      .lean()
      .exec();

    const existingTopicIds = new Set(
      existing.map((p) => p.topicId.toString()),
    );

    const newTopicIds = topicIds.filter(
      (id) => !existingTopicIds.has(id),
    );

    if (newTopicIds.length > 0) {
      const docs = newTopicIds.map((topicId) => ({
        userId: userObjectId,
        topicId: new Types.ObjectId(topicId),
        status: ProgressStatus.NOT_STARTED,
      }));

      await this.progressModel.insertMany(docs, { ordered: false });

      this.logger.log({
        msg: 'Created progress records for new subscriptions',
        userId,
        newTopicCount: newTopicIds.length,
      });
    }
  }

  // ──────────────────── Private Helpers ───────────────────────────────────

  /**
   * Get the question at a specific index in the difficulty-sorted order.
   */
  private async getQuestionAtIndex(
    topicId: string,
    index: number,
  ): Promise<Record<string, unknown> | null> {
    const results = await this.questionModel
      .aggregate([
        {
          $match: {
            topicId: new Types.ObjectId(topicId),
            isActive: true,
          },
        },
        {
          $addFields: {
            difficultyRank: {
              $switch: {
                branches: [
                  { case: { $eq: ['$difficulty', 'beginner'] }, then: 1 },
                  {
                    case: { $eq: ['$difficulty', 'intermediate'] },
                    then: 2,
                  },
                  { case: { $eq: ['$difficulty', 'advanced'] }, then: 3 },
                ],
                default: 2,
              },
            },
          },
        },
        { $sort: { difficultyRank: 1, createdAt: 1 } },
        { $skip: index },
        { $limit: 1 },
        { $project: { difficultyRank: 0 } },
      ])
      .exec();

    return results.length > 0 ? (results[0] as Record<string, unknown>) : null;
  }

  /**
   * Count the total active questions for a topic.
   */
  async countActiveQuestions(topicId: string): Promise<number> {
    return this.questionModel
      .countDocuments({
        topicId: new Types.ObjectId(topicId),
        isActive: true,
      })
      .exec();
  }

  /**
   * Estimate the current difficulty level based on question index.
   * This is an approximation — the actual difficulty comes from the question.
   */
  private getDifficultyAtIndex(
    index: number,
    totalQuestions: number,
  ): string {
    if (totalQuestions === 0) return 'beginner';
    const ratio = index / totalQuestions;
    if (ratio < 0.4) return 'beginner';
    if (ratio < 0.7) return 'intermediate';
    return 'advanced';
  }
}
