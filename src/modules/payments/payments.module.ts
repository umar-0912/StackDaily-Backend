import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { User, UserSchema } from '../../database/schemas/user.schema.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsWebhookController } from './payments-webhook.controller.js';
import { StripeWebhookController } from './stripe-webhook.controller.js';
import { PaymentsService } from './payments.service.js';
import { RazorpayService } from './razorpay.service.js';
import { StripeService } from './stripe.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [PaymentsController, PaymentsWebhookController, StripeWebhookController],
  providers: [PaymentsService, RazorpayService, StripeService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
