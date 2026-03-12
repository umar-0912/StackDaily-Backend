import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserTopicProgressDocument = HydratedDocument<UserTopicProgress>;

export enum ProgressStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

@Schema({
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform(_doc, ret: Record<string, unknown>) {
      delete ret['__v'];
      return ret;
    },
  },
  toObject: {
    virtuals: true,
  },
})
export class UserTopicProgress {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
  })
  userId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Topic',
    required: true,
  })
  topicId: Types.ObjectId;

  @Prop({
    type: String,
    enum: ProgressStatus,
    default: ProgressStatus.NOT_STARTED,
  })
  status: ProgressStatus;

  @Prop({
    type: Number,
    default: 0,
  })
  currentQuestionIndex: number;

  @Prop({
    type: Number,
    default: 0,
  })
  questionsAnswered: number;

  @Prop({
    type: String,
    default: null,
  })
  lastQuestionDate: string | null;

  @Prop({
    type: Types.ObjectId,
    ref: 'Question',
    default: null,
  })
  lastQuestionId: Types.ObjectId | null;

  @Prop({
    type: String,
    default: null,
  })
  lastAdvancedDate: string | null;

  @Prop({
    type: Date,
    default: null,
  })
  startedAt: Date | null;

  @Prop({
    type: Date,
    default: null,
  })
  completedAt: Date | null;
}

export const UserTopicProgressSchema =
  SchemaFactory.createForClass(UserTopicProgress);

// Unique compound index: one progress record per user per topic
UserTopicProgressSchema.index({ userId: 1, topicId: 1 }, { unique: true });

// Index for querying user's progress by status
UserTopicProgressSchema.index({ userId: 1, status: 1 });
