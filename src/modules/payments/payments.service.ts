import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import {
  User,
  UserDocument,
  SubscriptionPlan,
  SubscriptionStatus,
} from '../../database/schemas/user.schema.js';
import { RazorpayService } from './razorpay.service.js';
import { ERROR_MESSAGES } from '../../common/constants/index.js';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly razorpayService: RazorpayService,
    private readonly configService: ConfigService,
    @InjectPinoLogger(PaymentsService.name)
    private readonly logger: PinoLogger,
  ) {}

  // ──────────────────── Create Subscription ──────────────────────────────────

  /**
   * Create a Razorpay subscription for the user.
   * Returns the short_url for the user to complete payment.
   */
  async createSubscription(
    userId: string,
  ): Promise<{ shortUrl: string; subscriptionId: string; razorpayKeyId: string }> {
    this.logger.info({ userId }, 'Creating subscription');

    const user = await this.userModel.findById(userId).lean().exec();
    if (!user) {
      throw new BadRequestException(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    // Guard: already Pro and active with future endDate
    if (
      user.subscription?.plan === SubscriptionPlan.PRO &&
      user.subscription?.status === SubscriptionStatus.ACTIVE &&
      user.subscription?.endDate &&
      new Date(user.subscription.endDate) > new Date()
    ) {
      throw new BadRequestException(ERROR_MESSAGES.PAYMENT_ALREADY_PRO);
    }

    try {
      // Step 1: Create or reuse Razorpay customer
      let customerId = user.razorpayCustomerId;
      if (!customerId) {
        const customer = await this.razorpayService.createCustomer(
          user.email,
          user.username,
        );
        customerId = customer.id;
        await this.userModel.findByIdAndUpdate(userId, {
          $set: { razorpayCustomerId: customerId },
        });
      }

      // Step 2: Create Razorpay subscription
      const planId = this.configService.get<string>('razorpay.planId')!;
      const subscription = await this.razorpayService.createSubscription(
        planId,
        customerId,
      );

      // Step 3: Store the subscription ID on the user
      await this.userModel.findByIdAndUpdate(userId, {
        $set: { razorpaySubscriptionId: subscription.id },
      });

      this.logger.info(
        { userId, subscriptionId: subscription.id },
        'Razorpay subscription created successfully',
      );

      return {
        shortUrl: subscription.short_url,
        subscriptionId: subscription.id,
        razorpayKeyId: this.configService.get<string>('razorpay.keyId')!,
      };
    } catch (error) {
      // Re-throw known exceptions
      if (error instanceof BadRequestException) throw error;

      this.logger.error(
        { err: error, userId },
        'Failed to create Razorpay subscription',
      );
      throw new InternalServerErrorException(
        ERROR_MESSAGES.PAYMENT_SUBSCRIPTION_CREATION_FAILED,
      );
    }
  }

  // ──────────────────── Cancel Subscription ──────────────────────────────────

  /**
   * Cancel the user's active Razorpay subscription.
   * cancel_at_cycle_end = true so the user retains access until the current period ends.
   */
  async cancelSubscription(userId: string): Promise<void> {
    this.logger.info({ userId }, 'Cancelling subscription');

    const user = await this.userModel.findById(userId).lean().exec();
    if (!user) {
      throw new BadRequestException(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    if (!user.razorpaySubscriptionId) {
      throw new BadRequestException(
        ERROR_MESSAGES.PAYMENT_NO_ACTIVE_SUBSCRIPTION,
      );
    }

    try {
      await this.razorpayService.cancelSubscription(
        user.razorpaySubscriptionId,
        true,
      );

      await this.userModel.findByIdAndUpdate(userId, {
        $set: {
          'subscription.status': SubscriptionStatus.CANCELLED,
          'subscription.cancelledAt': new Date(),
        },
      });

      this.logger.info(
        { userId, subscriptionId: user.razorpaySubscriptionId },
        'Subscription cancellation requested',
      );
    } catch (error) {
      if (error instanceof BadRequestException) throw error;

      this.logger.error(
        { err: error, userId },
        'Failed to cancel Razorpay subscription',
      );
      throw new InternalServerErrorException(
        ERROR_MESSAGES.PAYMENT_CANCELLATION_FAILED,
      );
    }
  }

  // ──────────────────── Webhook Handler ──────────────────────────────────────

  /**
   * Handle Razorpay webhook events.
   * Updates user subscription state based on the event type.
   */
  async handleWebhookEvent(event: string, payload: any): Promise<void> {
    this.logger.info({ event }, 'Processing Razorpay webhook event');

    const subscriptionEntity = payload?.subscription?.entity;
    if (!subscriptionEntity?.id) {
      this.logger.warn({ event }, 'Webhook payload missing subscription entity');
      return;
    }

    const razorpaySubscriptionId = subscriptionEntity.id as string;

    // Find the user by their Razorpay subscription ID
    const user = await this.userModel
      .findOne({ razorpaySubscriptionId })
      .lean()
      .exec();

    if (!user) {
      this.logger.warn(
        { razorpaySubscriptionId, event },
        'No user found for Razorpay subscription ID',
      );
      return;
    }

    const userId = (user._id as any).toString();

    switch (event) {
      case 'subscription.activated': {
        // First successful payment — upgrade to Pro
        const now = new Date();
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + 30);

        await this.userModel.findByIdAndUpdate(userId, {
          $set: {
            'subscription.plan': SubscriptionPlan.PRO,
            'subscription.status': SubscriptionStatus.ACTIVE,
            'subscription.startDate': now,
            'subscription.endDate': endDate,
            'subscription.cancelledAt': null,
          },
        });

        this.logger.info({ userId, event }, 'User upgraded to Pro via webhook');
        break;
      }

      case 'subscription.charged': {
        // Recurring payment succeeded — extend endDate by 30 days
        const currentEndDate = user.subscription?.endDate
          ? new Date(user.subscription.endDate)
          : new Date();
        const newEndDate = new Date(
          Math.max(currentEndDate.getTime(), Date.now()),
        );
        newEndDate.setDate(newEndDate.getDate() + 30);

        await this.userModel.findByIdAndUpdate(userId, {
          $set: {
            'subscription.plan': SubscriptionPlan.PRO,
            'subscription.status': SubscriptionStatus.ACTIVE,
            'subscription.endDate': newEndDate,
            'subscription.cancelledAt': null,
          },
        });

        this.logger.info(
          { userId, event, newEndDate: newEndDate.toISOString() },
          'Subscription charged, endDate extended',
        );
        break;
      }

      case 'subscription.halted': {
        // Payment failed repeatedly — downgrade to free
        await this.userModel.findByIdAndUpdate(userId, {
          $set: {
            'subscription.plan': SubscriptionPlan.FREE,
            'subscription.status': SubscriptionStatus.EXPIRED,
            'subscription.cancelledAt': new Date(),
            razorpaySubscriptionId: null,
          },
        });

        this.logger.info(
          { userId, event },
          'User downgraded to Free (payment halted)',
        );
        break;
      }

      case 'subscription.cancelled': {
        // User/admin cancelled — downgrade to free
        await this.userModel.findByIdAndUpdate(userId, {
          $set: {
            'subscription.plan': SubscriptionPlan.FREE,
            'subscription.status': SubscriptionStatus.CANCELLED,
            'subscription.cancelledAt': new Date(),
            razorpaySubscriptionId: null,
          },
        });

        this.logger.info(
          { userId, event },
          'User downgraded to Free (subscription cancelled)',
        );
        break;
      }

      case 'subscription.pending': {
        // Payment is pending (UPI mandate authorization pending)
        this.logger.info({ userId, event }, 'Subscription payment pending');
        break;
      }

      default:
        this.logger.debug({ event }, 'Unhandled webhook event, ignoring');
    }
  }

  // ──────────────────── Subscription Expiry Cron ─────────────────────────────

  /**
   * Safety-net cron: runs daily at 2 AM.
   * Finds Pro users whose endDate has passed and downgrades them to Free.
   * This handles edge cases where a webhook was missed.
   */
  @Cron('0 2 * * *')
  async expireOverdueSubscriptions(): Promise<void> {
    this.logger.info('Running subscription expiry cron');

    const result = await this.userModel.updateMany(
      {
        'subscription.plan': SubscriptionPlan.PRO,
        'subscription.status': SubscriptionStatus.ACTIVE,
        'subscription.endDate': { $lt: new Date() },
      },
      {
        $set: {
          'subscription.plan': SubscriptionPlan.FREE,
          'subscription.status': SubscriptionStatus.EXPIRED,
        },
      },
    );

    this.logger.info(
      { expiredCount: result.modifiedCount },
      'Subscription expiry cron completed',
    );
  }
}
