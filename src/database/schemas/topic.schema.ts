import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TopicDocument = HydratedDocument<Topic>;

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
export class Topic {
  @Prop({
    type: String,
    required: true,
    unique: true,
    trim: true,
  })
  name: string;

  @Prop({
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    index: true,
  })
  slug: string;

  @Prop({
    type: String,
    required: true,
    index: true,
  })
  category: string;

  @Prop({
    type: String,
    required: true,
  })
  description: string;

  @Prop({ type: String })
  icon?: string;

  @Prop({
    type: Boolean,
    default: true,
  })
  isActive: boolean;

  @Prop({
    type: Number,
    default: 0,
  })
  sortOrder: number;
}

export const TopicSchema = SchemaFactory.createForClass(Topic);

// Compound index for listing active topics sorted by order
TopicSchema.index({ isActive: 1, sortOrder: 1 });
