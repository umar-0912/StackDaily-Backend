import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Question,
  QuestionSchema,
} from '../../database/schemas/question.schema.js';
import { Topic, TopicSchema } from '../../database/schemas/topic.schema.js';
import {
  AiAnswer,
  AiAnswerSchema,
} from '../../database/schemas/ai-answer.schema.js';
import { QuestionsService } from './questions.service.js';
import { QuestionsController } from './questions.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Question.name, schema: QuestionSchema },
      { name: Topic.name, schema: TopicSchema },
      { name: AiAnswer.name, schema: AiAnswerSchema },
    ]),
  ],
  controllers: [QuestionsController],
  providers: [QuestionsService],
  exports: [QuestionsService],
})
export class QuestionsModule {}
