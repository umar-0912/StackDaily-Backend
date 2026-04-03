import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Topic, TopicSchema } from '../../database/schemas/topic.schema.js';
import { TopicsService } from './topics.service.js';
import { TopicsController } from './topics.controller.js';
import { TopicSeeder } from '../../database/seeders/topic.seeder.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Topic.name, schema: TopicSchema }]),
  ],
  controllers: [TopicsController],
  providers: [TopicsService, TopicSeeder],
  exports: [TopicsService],
})
export class TopicsModule {}
