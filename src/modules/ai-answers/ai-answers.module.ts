import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  AiAnswer,
  AiAnswerSchema,
} from '../../database/schemas/ai-answer.schema.js';
import {
  Question,
  QuestionSchema,
} from '../../database/schemas/question.schema.js';
import { Topic, TopicSchema } from '../../database/schemas/topic.schema.js';
import { AiAnswersService } from './ai-answers.service.js';
import { AiAnswersController } from './ai-answers.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AiAnswer.name, schema: AiAnswerSchema },
      { name: Question.name, schema: QuestionSchema },
      { name: Topic.name, schema: TopicSchema },
    ]),
  ],
  controllers: [AiAnswersController],
  providers: [AiAnswersService],
  exports: [AiAnswersService],
})
export class AiAnswersModule {}
