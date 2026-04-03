import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  UserTopicProgress,
  UserTopicProgressSchema,
} from '../../database/schemas/user-topic-progress.schema.js';
import {
  Question,
  QuestionSchema,
} from '../../database/schemas/question.schema.js';
import { Topic, TopicSchema } from '../../database/schemas/topic.schema.js';

import { ProgressService } from './progress.service.js';
import { ProgressController } from './progress.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserTopicProgress.name, schema: UserTopicProgressSchema },
      { name: Question.name, schema: QuestionSchema },
      { name: Topic.name, schema: TopicSchema },
    ]),
  ],
  controllers: [ProgressController],
  providers: [ProgressService],
  exports: [ProgressService],
})
export class ProgressModule {}
