import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import * as admin from 'firebase-admin';
import { readFileSync } from 'node:fs';

import {
  NotificationLog,
  NotificationLogDocument,
  NotificationStatus,
} from '../../database/schemas/notification-log.schema.js';
import { User, UserDocument } from '../../database/schemas/user.schema.js';
import { PAGINATION } from '../../common/constants/index.js';

/** FCM error codes indicating an invalid or expired registration token. */
const INVALID_TOKEN_CODES = [
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
];

interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

interface BatchUserEntry {
  userId: string;
  fcmToken: string;
}

interface BatchSendResult {
  sent: number;
  failed: number;
}

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly fcmBatchLimit: number;

  constructor(
    @InjectModel(NotificationLog.name)
    private readonly notificationLogModel: Model<NotificationLogDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly configService: ConfigService,
  ) {
    this.fcmBatchLimit = this.configService.get<number>('FCM_BATCH_LIMIT', 500);
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────

  /**
   * Initialize Firebase Admin SDK on module start.
   * Checks if already initialized to remain idempotent across hot-reloads.
   */
  onModuleInit(): void {
    if (admin.apps.length > 0) {
      this.logger.log('Firebase Admin SDK already initialized');
      return;
    }

    const serviceAccountPath = this.configService.get<string>(
      'FIREBASE_SERVICE_ACCOUNT_PATH',
    );

    try {
      if (serviceAccountPath) {
        const serviceAccount = JSON.parse(
          readFileSync(serviceAccountPath, 'utf-8'),
        );
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        this.logger.log(
          'Firebase Admin SDK initialized with service account credential',
        );
      } else {
        const projectId = this.configService.get<string>('fcm.projectId');
        admin.initializeApp({
          projectId,
        });
        this.logger.log(
          `Firebase Admin SDK initialized with project ID: ${projectId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to initialize Firebase Admin SDK: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  // ─── Send to single user ───────────────────────────────────────────

  /**
   * Send a push notification to a single user and persist the result.
   */
  async sendToUser(
    userId: string,
    fcmToken: string,
    payload: NotificationPayload,
    dailySelectionId?: string,
  ): Promise<NotificationLogDocument> {
    const logEntry = new this.notificationLogModel({
      userId: new Types.ObjectId(userId),
      dailySelectionId: dailySelectionId
        ? new Types.ObjectId(dailySelectionId)
        : new Types.ObjectId(),
      status: NotificationStatus.PENDING,
    });

    try {
      const message: admin.messaging.TokenMessage = {
        token: fcmToken,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        ...(payload.data && { data: payload.data }),
      };

      const messageId = await admin.messaging().send(message);

      logEntry.status = NotificationStatus.SENT;
      logEntry.sentAt = new Date();
      await logEntry.save();

      this.logger.log({
        msg: 'Notification sent successfully',
        userId,
        messageId,
      });

      return logEntry;
    } catch (error) {
      const errorCode = (error as { code?: string }).code ?? 'unknown';
      const errorMessage =
        (error as Error).message ?? 'Unknown error';

      logEntry.status = NotificationStatus.FAILED;
      logEntry.error = `${errorCode}: ${errorMessage}`;
      logEntry.sentAt = new Date();
      await logEntry.save();

      if (INVALID_TOKEN_CODES.includes(errorCode)) {
        this.logger.warn({
          msg: 'Invalid FCM token detected, marking for cleanup',
          userId,
          errorCode,
        });
        await this.markTokenInvalid(userId);
      } else {
        this.logger.error({
          msg: 'Failed to send notification',
          userId,
          errorCode,
          errorMessage,
        });
      }

      return logEntry;
    }
  }

  // ─── Send to multiple users (batched) ──────────────────────────────

  /**
   * Send notifications to multiple users in batches (default 500, configurable via FCM_BATCH_LIMIT env).
   * Creates a NotificationLog entry for each user and cleans up invalid tokens.
   */
  async sendToMultipleUsers(
    users: BatchUserEntry[],
    payload: NotificationPayload,
    dailySelectionId: string,
  ): Promise<BatchSendResult> {
    const totalBatches = Math.ceil(users.length / this.fcmBatchLimit);
    let totalSent = 0;
    let totalFailed = 0;

    this.logger.log({
      msg: 'Starting batch notification send',
      totalUsers: users.length,
      totalBatches,
      dailySelectionId,
    });

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * this.fcmBatchLimit;
      const batchUsers = users.slice(
        batchStart,
        batchStart + this.fcmBatchLimit,
      );

      const tokens = batchUsers.map((u) => u.fcmToken);

      const multicastMessage: admin.messaging.MulticastMessage = {
        tokens,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        ...(payload.data && { data: payload.data }),
      };

      try {
        const batchResponse = await admin
          .messaging()
          .sendEachForMulticast(multicastMessage);

        const invalidUserIds: string[] = [];

        // Create notification log entries for each result
        const logEntries = batchResponse.responses.map(
          (response, index) => {
            const user = batchUsers[index];
            const now = new Date();

            if (response.success) {
              return {
                userId: new Types.ObjectId(user.userId),
                dailySelectionId: new Types.ObjectId(dailySelectionId),
                status: NotificationStatus.SENT,
                sentAt: now,
              };
            }

            const errorCode =
              (response.error as { code?: string })?.code ?? 'unknown';
            const errorMessage =
              response.error?.message ?? 'Unknown error';

            if (INVALID_TOKEN_CODES.includes(errorCode)) {
              invalidUserIds.push(user.userId);
            }

            return {
              userId: new Types.ObjectId(user.userId),
              dailySelectionId: new Types.ObjectId(dailySelectionId),
              status: NotificationStatus.FAILED,
              error: `${errorCode}: ${errorMessage}`,
              sentAt: now,
            };
          },
        );

        // Bulk insert notification logs for efficiency
        await this.notificationLogModel.insertMany(logEntries);

        // Clean up invalid tokens
        if (invalidUserIds.length > 0) {
          await this.bulkMarkTokensInvalid(invalidUserIds);
          this.logger.warn({
            msg: 'Invalid tokens cleaned up in batch',
            batchNumber: batchIndex + 1,
            invalidCount: invalidUserIds.length,
          });
        }

        totalSent += batchResponse.successCount;
        totalFailed += batchResponse.failureCount;

        this.logger.log({
          msg: 'Batch notification send completed',
          batchNumber: batchIndex + 1,
          totalBatches,
          sent: batchResponse.successCount,
          failed: batchResponse.failureCount,
        });
      } catch (error) {
        // If the entire batch request fails, log all as failed
        const errorMessage =
          (error as Error).message ?? 'Unknown batch error';

        const failedEntries = batchUsers.map((user) => ({
          userId: new Types.ObjectId(user.userId),
          dailySelectionId: new Types.ObjectId(dailySelectionId),
          status: NotificationStatus.FAILED,
          error: `batch_error: ${errorMessage}`,
          sentAt: new Date(),
        }));

        await this.notificationLogModel.insertMany(failedEntries);
        totalFailed += batchUsers.length;

        this.logger.error({
          msg: 'Entire batch failed',
          batchNumber: batchIndex + 1,
          totalBatches,
          error: errorMessage,
        });
      }
    }

    this.logger.log({
      msg: 'All batches completed',
      totalSent,
      totalFailed,
      dailySelectionId,
    });

    return { sent: totalSent, failed: totalFailed };
  }

  // ─── Send daily notifications ──────────────────────────────────────

  /**
   * Send daily notifications to all active users subscribed to a topic
   * who have a valid FCM token.
   */
  async sendDailyNotifications(
    topicId: string,
    dailySelectionId: string,
    payload: NotificationPayload,
  ): Promise<BatchSendResult> {
    this.logger.log({
      msg: 'Starting daily notification dispatch',
      topicId,
      dailySelectionId,
    });

    const users = await this.userModel
      .find({
        isActive: true,
        subscribedTopics: new Types.ObjectId(topicId),
        fcmToken: { $ne: null, $exists: true },
      })
      .lean()
      .select('_id fcmToken')
      .exec();

    if (users.length === 0) {
      this.logger.log({
        msg: 'No eligible users found for daily notification',
        topicId,
      });
      return { sent: 0, failed: 0 };
    }

    const batchUsers: BatchUserEntry[] = users.map((user) => ({
      userId: user._id.toString(),
      fcmToken: user.fcmToken!,
    }));

    this.logger.log({
      msg: 'Eligible users found for daily notification',
      topicId,
      userCount: batchUsers.length,
    });

    const result = await this.sendToMultipleUsers(
      batchUsers,
      payload,
      dailySelectionId,
    );

    this.logger.log({
      msg: 'Daily notification dispatch completed',
      topicId,
      dailySelectionId,
      sent: result.sent,
      failed: result.failed,
    });

    return result;
  }

  // ─── Notification history ──────────────────────────────────────────

  /**
   * Get paginated notification history for a user, sorted by most recent first.
   */
  async getNotificationHistory(
    userId: string,
    page: number = PAGINATION.DEFAULT_PAGE,
    limit: number = PAGINATION.DEFAULT_LIMIT,
  ) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), PAGINATION.MAX_LIMIT);
    const skip = (safePage - 1) * safeLimit;

    const [data, total] = await Promise.all([
      this.notificationLogModel
        .find({ userId: new Types.ObjectId(userId) })
        .sort({ sentAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean()
        .exec(),
      this.notificationLogModel
        .countDocuments({ userId: new Types.ObjectId(userId) })
        .exec(),
    ]);

    return {
      data,
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  // ─── Delivery stats ────────────────────────────────────────────────

  /**
   * Get delivery statistics for a specific daily selection.
   * Returns a breakdown of notification statuses.
   */
  async getDeliveryStats(dailySelectionId: string) {
    const pipeline = [
      {
        $match: {
          dailySelectionId: new Types.ObjectId(dailySelectionId),
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ];

    const results = await this.notificationLogModel
      .aggregate(pipeline)
      .exec();

    const stats = {
      total: 0,
      sent: 0,
      failed: 0,
      delivered: 0,
      pending: 0,
    };

    for (const result of results) {
      const status = result._id as NotificationStatus;
      const count = result.count as number;
      stats.total += count;

      switch (status) {
        case NotificationStatus.SENT:
          stats.sent = count;
          break;
        case NotificationStatus.FAILED:
          stats.failed = count;
          break;
        case NotificationStatus.DELIVERED:
          stats.delivered = count;
          break;
        case NotificationStatus.PENDING:
          stats.pending = count;
          break;
      }
    }

    this.logger.log({
      msg: 'Delivery stats retrieved',
      dailySelectionId,
      stats,
    });

    return stats;
  }

  // ─── Token cleanup ─────────────────────────────────────────────────

  /**
   * Remove FCM tokens that have been marked as invalid.
   * Called periodically or after batch sends to keep the user collection clean.
   */
  async cleanupInvalidTokens(): Promise<number> {
    const result = await this.userModel
      .updateMany(
        { fcmToken: '__invalid__' },
        { $set: { fcmToken: null } },
      )
      .exec();

    const cleanedCount = result.modifiedCount;

    if (cleanedCount > 0) {
      this.logger.log({
        msg: 'Invalid FCM tokens cleaned up',
        cleanedCount,
      });
    }

    return cleanedCount;
  }

  @Cron('0 3 * * *')
  async scheduledTokenCleanup(): Promise<void> {
    this.logger.log({ msg: 'Running scheduled FCM token cleanup' });
    await this.cleanupInvalidTokens();
  }

  // ─── Private helpers ───────────────────────────────────────────────

  /**
   * Mark a single user's FCM token as invalid so it can be cleaned up.
   */
  private async markTokenInvalid(userId: string): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: new Types.ObjectId(userId) },
        { $set: { fcmToken: '__invalid__' } },
      )
      .exec();
  }

  /**
   * Mark multiple users' FCM tokens as invalid in a single bulk operation.
   */
  private async bulkMarkTokensInvalid(userIds: string[]): Promise<void> {
    const objectIds = userIds.map((id) => new Types.ObjectId(id));

    await this.userModel
      .updateMany(
        { _id: { $in: objectIds } },
        { $set: { fcmToken: '__invalid__' } },
      )
      .exec();
  }
}
