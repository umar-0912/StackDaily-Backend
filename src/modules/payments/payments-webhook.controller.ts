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

import { RazorpayService } from './razorpay.service.js';
import { PaymentsService } from './payments.service.js';

/**
 * Unauthenticated webhook controller for Razorpay callbacks.
 * Separate from PaymentsController to avoid JwtAuthGuard conflicts.
 */
@ApiTags('Payments - Webhooks')
@Controller('api/v1/payments')
export class PaymentsWebhookController {
  private readonly logger = new Logger(PaymentsWebhookController.name);

  constructor(
    private readonly razorpayService: RazorpayService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async handleWebhook(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const signature = req.headers['x-razorpay-signature'] as string;

    if (!signature) {
      this.logger.warn('Webhook received without signature header');
      res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'Missing signature' });
      return;
    }

    // Raw body is stored by the verify callback in main.ts
    const rawBody = (req as any).rawBody as string | undefined;
    if (!rawBody) {
      this.logger.error('Raw body not available for webhook verification');
      res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'Raw body unavailable' });
      return;
    }

    const isValid = this.razorpayService.verifyWebhookSignature(
      rawBody,
      signature,
    );
    if (!isValid) {
      this.logger.warn('Webhook signature verification failed');
      res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'Invalid signature' });
      return;
    }

    const body = req.body;
    const event = body.event as string;
    const payload = body.payload;

    this.logger.log(`Webhook signature verified, processing event: ${event}`);

    // Process the event — always return 200 to Razorpay to prevent retry floods
    try {
      await this.paymentsService.handleWebhookEvent(event, payload);
    } catch (error) {
      this.logger.error(
        `Error processing webhook event ${event}: ${error}`,
      );
    }

    res.status(HttpStatus.OK).json({ status: 'ok' });
  }
}
