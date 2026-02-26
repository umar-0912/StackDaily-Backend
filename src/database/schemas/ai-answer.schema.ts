import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AiAnswerDocument = HydratedDocument<AiAnswer>;

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
export class AiAnswer {
  @Prop({
    type: Types.ObjectId,
    ref: 'Question',
    required: true,
    unique: true,
    index: true,
  })
  questionId: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
  })
  answer: string;

  @Prop({
    type: Date,
    required: true,
  })
  generatedAt: Date;

  @Prop({
    type: String,
    required: true,
  })
  model: string;

  @Prop({
    type: Number,
  })
  tokenCount?: number;

  @Prop({
    type: Boolean,
    default: false,
  })
  isStale: boolean;
}

export const AiAnswerSchema = SchemaFactory.createForClass(AiAnswer);

// Index for finding stale answers that need regeneration
AiAnswerSchema.index({ isStale: 1 });
