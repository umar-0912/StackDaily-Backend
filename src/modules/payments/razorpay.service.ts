import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import * as crypto from 'crypto';
import Razorpay from 'razorpay';

@Injectable()
export class RazorpayService implements OnModuleInit {
  private razorpay: Razorpay;

  constructor(
    private readonly configService: ConfigService,
    @InjectPinoLogger(RazorpayService.name)
    private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    const keyId = this.configService.get<string>('razorpay.keyId');
    const keySecret = this.configService.get<string>('razorpay.keySecret');

    if (!keyId || !keySecret) {
      this.logger.warn(
        'Razorpay credentials not configured — payment features disabled',
      );
      return;
    }

    this.razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
    this.logger.info('Razorpay SDK initialized');
  }

  // ──────────────────── Customer ─────────────────────────────────────────────

  /**
   * Create a Razorpay customer or return existing one if email matches.
   */
  async createCustomer(
    email: string,
    name: string,
  ): Promise<{ id: string }> {
    const customer = (await this.razorpay.customers.create({
      name,
      email,
      fail_existing: 0, // return existing customer if email matches
    })) as { id: string };
    this.logger.info({ customerId: customer.id, email }, 'Razorpay customer created/fetched');
    return { id: customer.id };
  }

  // ──────────────────── Subscription ─────────────────────────────────────────

  /**
   * Create a Razorpay subscription against a plan.
   * Returns the subscription id and short_url for checkout.
   */
  async createSubscription(
    planId: string,
    customerId: string,
    totalCount: number,
  ): Promise<{ id: string; short_url: string }> {
    const subscription = (await this.razorpay.subscriptions.create({
      plan_id: planId,
      customer_id: customerId,
      total_count: totalCount,
      customer_notify: 1,
    } as any)) as { id: string; short_url: string };
    this.logger.info(
      { subscriptionId: subscription.id, planId, totalCount },
      'Razorpay subscription created',
    );
    return { id: subscription.id, short_url: subscription.short_url! };
  }

  /**
   * Cancel a Razorpay subscription.
   * @param cancelAtCycleEnd If true, subscription remains active until the current billing cycle ends.
   */
  async cancelSubscription(
    subscriptionId: string,
    cancelAtCycleEnd: boolean = true,
  ): Promise<void> {
    await this.razorpay.subscriptions.cancel(subscriptionId, cancelAtCycleEnd);
    this.logger.info(
      { subscriptionId, cancelAtCycleEnd },
      'Razorpay subscription cancelled',
    );
  }

  /**
   * Fetch a Razorpay subscription by ID (for debugging/admin).
   */
  async fetchSubscription(subscriptionId: string) {
    return this.razorpay.subscriptions.fetch(subscriptionId);
  }

  // ──────────────────── Webhook Verification ─────────────────────────────────

  /**
   * Verify Razorpay webhook signature using HMAC-SHA256.
   */
  verifyWebhookSignature(body: string, signature: string): boolean {
    const webhookSecret = this.configService.get<string>(
      'razorpay.webhookSecret',
    )!;
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');
    return expectedSignature === signature;
  }
}
