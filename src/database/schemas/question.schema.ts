import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type QuestionDocument = HydratedDocument<Question>;

export enum QuestionDifficulty {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
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
export class Question {
  @Prop({
    type: Types.ObjectId,
    ref: 'Topic',
    required: true,
    index: true,
  })
  topicId: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
  })
  text: string;

  @Prop({
    type: String,
    enum: QuestionDifficulty,
    default: QuestionDifficulty.INTERMEDIATE,
    index: true,
  })
  difficulty: QuestionDifficulty;

  @Prop({
    type: [String],
    default: [],
    index: true,
  })
  tags: string[];

  @Prop({
    type: Boolean,
    default: true,
  })
  isActive: boolean;

  @Prop({
    type: Date,
    index: true,
  })
  lastUsedDate?: Date;

  @Prop({
    type: Number,
    default: 0,
  })
  usageCount: number;
}

export const QuestionSchema = SchemaFactory.createForClass(Question);

// Compound index for selecting questions by topic, active status, and least recently used
QuestionSchema.index({ topicId: 1, isActive: 1, lastUsedDate: 1 });

// Index for querying questions by tags
QuestionSchema.index({ tags: 1 });
