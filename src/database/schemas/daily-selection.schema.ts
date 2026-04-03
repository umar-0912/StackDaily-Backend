import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type DailySelectionDocument = HydratedDocument<DailySelection>;

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
export class DailySelection {
  @Prop({
    type: String,
    required: true,
    index: true,
  })
  date: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'Topic',
    required: true,
  })
  topicId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Question',
    required: true,
  })
  questionId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'AiAnswer',
  })
  aiAnswerId?: Types.ObjectId;

  @Prop({
    type: Number,
    default: 0,
  })
  notificationsSent: number;
}

export const DailySelectionSchema =
  SchemaFactory.createForClass(DailySelection);

// Unique compound index ensuring one question per topic per day
DailySelectionSchema.index({ date: 1, topicId: 1 }, { unique: true });

// Index for querying all selections for a given date
DailySelectionSchema.index({ date: 1 });
