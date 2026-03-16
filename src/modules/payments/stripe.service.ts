import { Injectable, OnModuleInit, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import Stripe from 'stripe';

import { SubscriptionTier } from '../../database/schemas/user.schema.js';
import { STRIPE_SUBSCRIPTION_TIERS } from '../../common/constants/index.js';

@Injectable()
export class StripeService implements OnModuleInit {
  private stripe: Stripe | null = null;

  constructor(
    private readonly configService: ConfigService,
    @InjectPinoLogger(StripeService.name)
    private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    const secretKey = this.configService.get<string>('stripe.secretKey');

    if (!secretKey) {
      this.logger.warn(
        'Stripe credentials not configured — international payment features disabled',
      );
      return;
    }

    this.stripe = new Stripe(secretKey);
    this.logger.info('Stripe SDK initialized');
  }

  // ──────────────────── Guards ──────────────────────────────────────────────

  private ensureInitialized(): Stripe {
    if (!this.stripe) {
      throw new BadRequestException(
        'Stripe is not configured. International payments are unavailable.',
      );
    }
    return this.stripe;
  }

  // ──────────────────── Customer ────────────────────────────────────────────

  /**
   * Create a Stripe customer. Returns the customer ID string.
   */
  async createCustomer(email: string, name: string): Promise<string> {
    const stripe = this.ensureInitialized();

    const customer = await stripe.customers.create({ email, name });
    this.logger.info(
      { customerId: customer.id, email },
      'Stripe customer created',
    );
    return customer.id;
  }

  // ──────────────────── Ephemeral Key ───────────────────────────────────────

  /**
   * Create an ephemeral key for the customer (used by mobile SDK).
   */
  async createEphemeralKey(customerId: string): Promise<string> {
    const stripe = this.ensureInitialized();

    const ephemeralKey = await stripe.ephemeralKeys.create({
      customer: customerId,
    });
    return ephemeralKey.secret!;
  }

  // ──────────────────── Price Resolution ────────────────────────────────────

  /**
   * Resolve the Stripe price ID from the subscription tier config.
   */
  getStripePriceId(tier: SubscriptionTier): string {
    const configMap: Record<SubscriptionTier, string> = {
      [SubscriptionTier.MONTHLY]:
        this.configService.get<string>('stripe.priceIdMonthly') || '',
      [SubscriptionTier.HALF_YEARLY]:
        this.configService.get<string>('stripe.priceIdHalfYearly') || '',
      [SubscriptionTier.YEARLY]:
        this.configService.get<string>('stripe.priceIdYearly') || '',
    };
    const priceId = configMap[tier];
    if (!priceId) {
      throw new BadRequestException(
        `Stripe price not configured for tier: ${tier}`,
      );
    }
    return priceId;
  }

  // ──────────────────── Subscription ────────────────────────────────────────

  /**
   * Create a Stripe subscription with incomplete initial payment.
   * Uses cancel_at to limit billing cycles based on tier totalCount.
   * Returns subscriptionId and clientSecret for frontend payment confirmation.
   */
  async createSubscription(
    customerId: string,
    priceId: string,
    totalCount: number,
  ): Promise<{ subscriptionId: string; clientSecret: string }> {
    const stripe = this.ensureInitialized();

    // Compute cancel_at timestamp to limit billing cycles
    const cancelAtSeconds =
      Math.floor(Date.now() / 1000) + totalCount * 30 * 24 * 60 * 60;

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.confirmation_secret'],
      cancel_at: cancelAtSeconds,
    });

    // Extract clientSecret from the expanded latest_invoice.confirmation_secret
    const invoice = subscription.latest_invoice as Stripe.Invoice;
    const clientSecret = invoice.confirmation_secret?.client_secret;

    if (!clientSecret) {
      throw new BadRequestException(
        'Failed to obtain payment client secret from Stripe subscription',
      );
    }

    this.logger.info(
      { subscriptionId: subscription.id, priceId, totalCount },
      'Stripe subscription created',
    );

    return {
      subscriptionId: subscription.id,
      clientSecret,
    };
  }

  /**
   * Cancel a Stripe subscription at the end of the current period.
   */
  async cancelSubscription(subscriptionId: string): Promise<void> {
    const stripe = this.ensureInitialized();

    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    this.logger.info(
      { subscriptionId },
      'Stripe subscription set to cancel at period end',
    );
  }

  // ──────────────────── Webhook Verification ────────────────────────────────

  /**
   * Construct and verify a Stripe webhook event from the raw body and signature.
   */
  constructEvent(rawBody: string, signature: string): Stripe.Event {
    const stripe = this.ensureInitialized();
    const webhookSecret = this.configService.get<string>(
      'stripe.webhookSecret',
    )!;

    return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  }
}
