import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { User, UserSchema } from '../../database/schemas/user.schema.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsWebhookController } from './payments-webhook.controller.js';
import { PaymentsService } from './payments.service.js';
import { RazorpayService } from './razorpay.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [PaymentsController, PaymentsWebhookController],
  providers: [PaymentsService, RazorpayService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
