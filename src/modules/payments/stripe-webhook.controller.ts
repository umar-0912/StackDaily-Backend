import {
  Controller,
  Post,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { StripeService } from './stripe.service.js';
import { PaymentsService } from './payments.service.js';

/**
 * Unauthenticated webhook controller for Stripe callbacks.
 * Separate from PaymentsController to avoid JwtAuthGuard conflicts.
 */
@ApiTags('Payments - Webhooks')
@Controller('api/v1/payments')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Post('stripe-webhook')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async handleStripeWebhook(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const signature = req.headers['stripe-signature'] as string;

    if (!signature) {
      this.logger.warn('Stripe webhook received without signature header');
      res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'Missing stripe-signature header' });
      return;
    }

    // Raw body is stored by the verify callback in main.ts
    const rawBody = (req as any).rawBody as string | undefined;
    if (!rawBody) {
      this.logger.error('Raw body not available for Stripe webhook verification');
      res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'Raw body unavailable' });
      return;
    }

    let event;
    try {
      event = this.stripeService.constructEvent(rawBody, signature);
    } catch (error) {
      this.logger.warn(
        `Stripe webhook signature verification failed: ${error}`,
      );
      res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'Invalid signature' });
      return;
    }

    this.logger.log(
      `Stripe webhook signature verified, processing event: ${event.type}`,
    );

    // Process the event — always return 200 to Stripe to prevent retry floods
    try {
      await this.paymentsService.handleStripeWebhookEvent(event);
    } catch (error) {
      this.logger.error(
        `Error processing Stripe webhook event ${event.type}: ${error}`,
      );
    }

    res.status(HttpStatus.OK).json({ received: true });
  }
}
