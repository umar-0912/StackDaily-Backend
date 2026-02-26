import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  NotificationLog,
  NotificationLogSchema,
} from '../../database/schemas/notification-log.schema.js';
import { User, UserSchema } from '../../database/schemas/user.schema.js';
import { NotificationsService } from './notifications.service.js';
import { NotificationsController } from './notifications.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: NotificationLog.name, schema: NotificationLogSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
