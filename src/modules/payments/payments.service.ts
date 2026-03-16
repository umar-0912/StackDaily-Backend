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
import Stripe from 'stripe';

import {
  User,
  UserDocument,
  SubscriptionPlan,
  SubscriptionStatus,
  SubscriptionTier,
  PaymentProvider,
} from '../../database/schemas/user.schema.js';
import { RazorpayService } from './razorpay.service.js';
import { StripeService } from './stripe.service.js';
import {
  ERROR_MESSAGES,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_TIERS,
  STRIPE_SUBSCRIPTION_TIERS,
} from '../../common/constants/index.js';
import { SubscribeResponseDto } from './dto/subscribe-response.dto.js';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly razorpayService: RazorpayService,
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService,
    @InjectPinoLogger(PaymentsService.name)
    private readonly logger: PinoLogger,
  ) {}

  // ──────────────────── Create Subscription ──────────────────────────────────

  /**
   * Create a subscription for the user with the specified tier and provider.
   * Routes to Razorpay (default) or Stripe based on the provider param.
   */
  async createSubscription(
    userId: string,
    tier: SubscriptionTier,
    provider: PaymentProvider = PaymentProvider.RAZORPAY,
  ): Promise<SubscribeResponseDto> {
    this.logger.info({ userId, tier, provider }, 'Creating subscription');

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

    if (provider === PaymentProvider.STRIPE) {
      return this.createStripeSubscription(userId, user, tier);
    }

    return this.createRazorpaySubscription(userId, user, tier);
  }

  // ──────────────────── Razorpay Subscription (private) ─────────────────────

  /**
   * Create a Razorpay subscription for the user with the specified tier.
   * Returns the short_url for the user to complete payment.
   */
  private async createRazorpaySubscription(
    userId: string,
    user: User & { _id: any },
    tier: SubscriptionTier,
  ): Promise<SubscribeResponseDto> {
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

      // Step 2: Create Razorpay subscription with tier-specific plan and total count
      const planId = this.getRazorpayPlanId(tier);
      const tierConfig = SUBSCRIPTION_TIERS[tier];
      const subscription = await this.razorpayService.createSubscription(
        planId,
        customerId,
        tierConfig.totalCount,
      );

      // Step 3: Store the subscription ID, tier, and provider on the user
      await this.userModel.findByIdAndUpdate(userId, {
        $set: {
          razorpaySubscriptionId: subscription.id,
          'subscription.tier': tier,
          paymentProvider: PaymentProvider.RAZORPAY,
        },
      });

      this.logger.info(
        { userId, subscriptionId: subscription.id, tier },
        'Razorpay subscription created successfully',
      );

      return {
        provider: PaymentProvider.RAZORPAY,
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

  // ──────────────────── Stripe Subscription (private) ───────────────────────

  /**
   * Create a Stripe subscription for the user with the specified tier.
   * Returns client secret and ephemeral key for mobile SDK payment confirmation.
   */
  private async createStripeSubscription(
    userId: string,
    user: User & { _id: any },
    tier: SubscriptionTier,
  ): Promise<SubscribeResponseDto> {
    try {
      // Step 1: Create or reuse Stripe customer
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        customerId = await this.stripeService.createCustomer(
          user.email,
          user.name,
        );
        await this.userModel.findByIdAndUpdate(userId, {
          $set: { stripeCustomerId: customerId },
        });
      }

      // Step 2: Create ephemeral key for mobile SDK
      const ephemeralKey =
        await this.stripeService.createEphemeralKey(customerId);

      // Step 3: Create Stripe subscription with tier-specific price
      const priceId = this.stripeService.getStripePriceId(tier);
      const tierConfig = STRIPE_SUBSCRIPTION_TIERS[tier];
      const { subscriptionId, clientSecret } =
        await this.stripeService.createSubscription(
          customerId,
          priceId,
          tierConfig.totalCount,
        );

      // Step 4: Store the subscription ID, tier, and provider on the user
      await this.userModel.findByIdAndUpdate(userId, {
        $set: {
          stripeSubscriptionId: subscriptionId,
          'subscription.tier': tier,
          paymentProvider: PaymentProvider.STRIPE,
        },
      });

      this.logger.info(
        { userId, subscriptionId, tier },
        'Stripe subscription created successfully',
      );

      return {
        provider: PaymentProvider.STRIPE,
        subscriptionId,
        clientSecret,
        ephemeralKey,
        stripeCustomerId: customerId,
        publishableKey: this.configService.get<string>(
          'stripe.publishableKey',
        )!,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;

      this.logger.error(
        { err: error, userId },
        'Failed to create Stripe subscription',
      );
      throw new InternalServerErrorException(
        ERROR_MESSAGES.PAYMENT_SUBSCRIPTION_CREATION_FAILED,
      );
    }
  }

  // ──────────────────── Helpers ─────────────────────────────────────────────

  /**
   * Resolve the Razorpay plan ID from the subscription tier.
   */
  private getRazorpayPlanId(tier: SubscriptionTier): string {
    const configMap: Record<SubscriptionTier, string> = {
      [SubscriptionTier.MONTHLY]: this.configService.get<string>('razorpay.planIdMonthly') || '',
      [SubscriptionTier.HALF_YEARLY]: this.configService.get<string>('razorpay.planIdHalfYearly') || '',
      [SubscriptionTier.YEARLY]: this.configService.get<string>('razorpay.planIdYearly') || '',
    };
    const planId = configMap[tier];
    if (!planId) {
      throw new BadRequestException(`Razorpay plan not configured for tier: ${tier}`);
    }
    return planId;
  }

  /**
   * Shared downgrade-to-free helper.
   * Trims topics to free plan limit, resets subscription state,
   * and clears the provider-specific subscription ID.
   *
   * @param status - SubscriptionStatus to set (EXPIRED for halted/completed, CANCELLED for cancelled)
   */
  private async downgradeToFree(
    user: User & { _id: any },
    provider: PaymentProvider | null,
    status: SubscriptionStatus = SubscriptionStatus.EXPIRED,
  ): Promise<void> {
    const userId = (user._id as any).toString();
    const maxTopics = SUBSCRIPTION_PLANS.free.maxTopics!;

    const trimmed =
      (user.subscribedTopics?.length ?? 0) > maxTopics
        ? user.subscribedTopics!.slice(0, maxTopics)
        : undefined;

    const $set: Record<string, unknown> = {
      'subscription.plan': SubscriptionPlan.FREE,
      'subscription.status': status,
      'subscription.cancelledAt': new Date(),
      'subscription.tier': null,
      paymentProvider: null,
    };

    // Clear the correct subscription ID based on provider
    if (provider === PaymentProvider.STRIPE) {
      $set.stripeSubscriptionId = null;
    } else {
      // Razorpay or null (backward compat)
      $set.razorpaySubscriptionId = null;
    }

    if (trimmed) {
      $set.subscribedTopics = trimmed;
      $set.topicSubscriptionHistory = trimmed;
    }

    await this.userModel.findByIdAndUpdate(userId, { $set });

    this.logger.info(
      { userId, provider, status, topicsTrimmed: !!trimmed },
      'User downgraded to Free',
    );
  }

  // ──────────────────── Cancel Subscription ──────────────────────────────────

  /**
   * Cancel the user's active subscription.
   * Routes to Razorpay or Stripe based on paymentProvider field.
   * For backward compat, falls back to checking razorpaySubscriptionId when paymentProvider is null.
   */
  async cancelSubscription(userId: string): Promise<void> {
    this.logger.info({ userId }, 'Cancelling subscription');

    const user = await this.userModel.findById(userId).lean().exec();
    if (!user) {
      throw new BadRequestException(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    // Route based on paymentProvider
    if (user.paymentProvider === PaymentProvider.STRIPE) {
      return this.cancelStripeSubscription(userId, user);
    }

    // Razorpay path (default + backward compat for null paymentProvider)
    return this.cancelRazorpaySubscription(userId, user);
  }

  /**
   * Cancel the user's Razorpay subscription.
   */
  private async cancelRazorpaySubscription(
    userId: string,
    user: User & { _id: any },
  ): Promise<void> {
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
        'Razorpay subscription cancellation requested',
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

  /**
   * Cancel the user's Stripe subscription.
   */
  private async cancelStripeSubscription(
    userId: string,
    user: User & { _id: any },
  ): Promise<void> {
    if (!user.stripeSubscriptionId) {
      throw new BadRequestException(
        ERROR_MESSAGES.PAYMENT_NO_ACTIVE_SUBSCRIPTION,
      );
    }

    try {
      await this.stripeService.cancelSubscription(user.stripeSubscriptionId);

      await this.userModel.findByIdAndUpdate(userId, {
        $set: {
          'subscription.status': SubscriptionStatus.CANCELLED,
          'subscription.cancelledAt': new Date(),
        },
      });

      this.logger.info(
        { userId, subscriptionId: user.stripeSubscriptionId },
        'Stripe subscription cancellation requested',
      );
    } catch (error) {
      if (error instanceof BadRequestException) throw error;

      this.logger.error(
        { err: error, userId },
        'Failed to cancel Stripe subscription',
      );
      throw new InternalServerErrorException(
        ERROR_MESSAGES.PAYMENT_CANCELLATION_FAILED,
      );
    }
  }

  // ──────────────────── Razorpay Webhook Handler ─────────────────────────────

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
            paymentProvider: PaymentProvider.RAZORPAY,
          },
        });

        this.logger.info({ userId, event }, 'User upgraded to Pro via Razorpay webhook');
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
        // Payment failed repeatedly — downgrade to free + force-reduce topics
        await this.downgradeToFree(user, PaymentProvider.RAZORPAY, SubscriptionStatus.EXPIRED);
        this.logger.info({ userId, event }, 'User downgraded to Free (payment halted)');
        break;
      }

      case 'subscription.cancelled': {
        // User/admin cancelled — downgrade to free + force-reduce topics
        await this.downgradeToFree(user, PaymentProvider.RAZORPAY, SubscriptionStatus.CANCELLED);
        this.logger.info({ userId, event }, 'User downgraded to Free (subscription cancelled)');
        break;
      }

      case 'subscription.completed': {
        // All billing cycles completed — downgrade to free + force-reduce topics
        await this.downgradeToFree(user, PaymentProvider.RAZORPAY, SubscriptionStatus.EXPIRED);
        this.logger.info(
          { userId, event },
          'User downgraded to Free (subscription completed — all cycles finished)',
        );
        break;
      }

      case 'subscription.pending': {
        // Payment is pending (UPI mandate authorization pending)
        this.logger.info({ userId, event }, 'Subscription payment pending');
        break;
      }

      default:
        this.logger.debug({ event }, 'Unhandled Razorpay webhook event, ignoring');
    }
  }

  // ──────────────────── Stripe Helpers ──────────────────────────────────────

  /**
   * Extract subscription ID from a Stripe Invoice object.
   * Handles both new API (parent.subscription_details.subscription) and
   * legacy API (invoice.subscription) for backward compatibility.
   */
  private extractSubscriptionIdFromInvoice(
    invoice: Stripe.Invoice,
  ): string | null {
    // New Stripe API (v2024+): parent.subscription_details.subscription
    const subRef = invoice.parent?.subscription_details?.subscription;
    if (subRef) {
      return typeof subRef === 'string'
        ? subRef
        : (subRef as Stripe.Subscription)?.id ?? null;
    }

    // Legacy fallback: invoice.subscription (deprecated but still present)
    const legacySub = (invoice as any).subscription;
    if (legacySub) {
      return typeof legacySub === 'string'
        ? legacySub
        : legacySub?.id ?? null;
    }

    return null;
  }

  // ──────────────────── Stripe Webhook Handler ──────────────────────────────

  /**
   * Handle Stripe webhook events.
   * Updates user subscription state based on the event type.
   */
  async handleStripeWebhookEvent(event: Stripe.Event): Promise<void> {
    this.logger.info(
      { type: event.type, id: event.id },
      'Processing Stripe webhook event',
    );

    switch (event.type) {
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeSubscriptionId =
          this.extractSubscriptionIdFromInvoice(invoice);

        if (!stripeSubscriptionId) {
          this.logger.warn(
            { eventId: event.id },
            'Stripe invoice.paid missing subscription ID',
          );
          return;
        }

        const user = await this.userModel
          .findOne({ stripeSubscriptionId })
          .lean()
          .exec();

        if (!user) {
          this.logger.warn(
            { stripeSubscriptionId },
            'No user found for Stripe subscription ID',
          );
          return;
        }

        const userId = (user._id as any).toString();

        // Check if this is the first payment (activation) or a recurring charge
        const isFirstPayment =
          !user.subscription?.startDate ||
          user.subscription?.plan !== SubscriptionPlan.PRO;

        if (isFirstPayment) {
          // First successful payment — activate PRO
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
              paymentProvider: PaymentProvider.STRIPE,
            },
          });

          this.logger.info(
            { userId },
            'User upgraded to Pro via Stripe webhook',
          );
        } else {
          // Recurring payment — extend endDate by 30 days
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
            { userId, newEndDate: newEndDate.toISOString() },
            'Stripe subscription charged, endDate extended',
          );
        }
        break;
      }

      case 'invoice.payment_failed': {
        const failedInvoice = event.data.object as Stripe.Invoice;
        const failedSubId =
          this.extractSubscriptionIdFromInvoice(failedInvoice);

        if (!failedSubId) return;

        const failedUser = await this.userModel
          .findOne({ stripeSubscriptionId: failedSubId })
          .lean()
          .exec();

        if (!failedUser) {
          this.logger.warn(
            { stripeSubscriptionId: failedSubId },
            'No user found for failed Stripe invoice',
          );
          return;
        }

        // Only downgrade if user is currently PRO
        if (failedUser.subscription?.plan === SubscriptionPlan.PRO) {
          await this.downgradeToFree(
            failedUser,
            PaymentProvider.STRIPE,
            SubscriptionStatus.EXPIRED,
          );
          this.logger.info(
            { userId: (failedUser._id as any).toString() },
            'User downgraded to Free (Stripe payment failed)',
          );
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const deletedSub = event.data.object as Stripe.Subscription;
        const deletedSubId = deletedSub.id;

        const deletedUser = await this.userModel
          .findOne({ stripeSubscriptionId: deletedSubId })
          .lean()
          .exec();

        if (!deletedUser) {
          this.logger.warn(
            { stripeSubscriptionId: deletedSubId },
            'No user found for deleted Stripe subscription',
          );
          return;
        }

        await this.downgradeToFree(
          deletedUser,
          PaymentProvider.STRIPE,
          SubscriptionStatus.EXPIRED,
        );
        this.logger.info(
          { userId: (deletedUser._id as any).toString() },
          'User downgraded to Free (Stripe subscription deleted)',
        );
        break;
      }

      default:
        this.logger.debug(
          { type: event.type },
          'Unhandled Stripe webhook event, ignoring',
        );
    }
  }

  // ──────────────────── Subscription Expiry Cron ─────────────────────────────

  /**
   * Safety-net cron: runs daily at 2 AM.
   * Finds Pro users whose endDate has passed and downgrades them to Free.
   * Also force-reduces subscribedTopics and topicSubscriptionHistory to the
   * free plan limit (oldest 3 topics kept).
   * Uses aggregation pipeline update for $slice on document-level arrays.
   */
  @Cron('0 2 * * *')
  async expireOverdueSubscriptions(): Promise<void> {
    this.logger.info('Running subscription expiry cron');

    const maxTopics = SUBSCRIPTION_PLANS.free.maxTopics!;

    const result = await this.userModel.updateMany(
      {
        'subscription.plan': SubscriptionPlan.PRO,
        'subscription.status': SubscriptionStatus.ACTIVE,
        'subscription.endDate': { $lt: new Date() },
      },
      [
        {
          $set: {
            'subscription.plan': SubscriptionPlan.FREE,
            'subscription.status': SubscriptionStatus.EXPIRED,
            'subscription.tier': null,
            razorpaySubscriptionId: null,
            stripeSubscriptionId: null,
            paymentProvider: null,
            subscribedTopics: { $slice: ['$subscribedTopics', maxTopics] },
            topicSubscriptionHistory: { $slice: ['$subscribedTopics', maxTopics] },
          },
        },
      ],
    );

    this.logger.info(
      { expiredCount: result.modifiedCount },
      'Subscription expiry cron completed (topics trimmed to free limit)',
    );
  }
}
