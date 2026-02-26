import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  DailySelection,
  DailySelectionSchema,
} from '../../database/schemas/daily-selection.schema.js';
import { Topic, TopicSchema } from '../../database/schemas/topic.schema.js';
import { User, UserSchema } from '../../database/schemas/user.schema.js';
import {
  Question,
  QuestionSchema,
} from '../../database/schemas/question.schema.js';
import {
  AiAnswer,
  AiAnswerSchema,
} from '../../database/schemas/ai-answer.schema.js';

import { DailyFlowService } from './daily-flow.service.js';
import { DailyFlowController } from './daily-flow.controller.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

/**
 * Module encapsulating the daily flow orchestration:
 * - Cron-based question selection and notification dispatch
 * - User daily feed retrieval
 * - Streak management
 * - Admin stats and manual trigger
 *
 * Uses direct model injection (not service injection from other modules)
 * to avoid circular dependency issues while those modules are still
 * being developed.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DailySelection.name, schema: DailySelectionSchema },
      { name: Topic.name, schema: TopicSchema },
      { name: User.name, schema: UserSchema },
      { name: Question.name, schema: QuestionSchema },
      { name: AiAnswer.name, schema: AiAnswerSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [DailyFlowController],
  providers: [DailyFlowService],
  exports: [DailyFlowService],
})
export class DailyFlowModule {}
