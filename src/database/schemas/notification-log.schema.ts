import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type NotificationLogDocument = HydratedDocument<NotificationLog>;

export enum NotificationStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
  DELIVERED = 'delivered',
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
export class NotificationLog {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'DailySelection',
    required: true,
    index: true,
  })
  dailySelectionId: Types.ObjectId;

  @Prop({
    type: String,
    enum: NotificationStatus,
    default: NotificationStatus.PENDING,
    index: true,
  })
  status: NotificationStatus;

  @Prop({ type: String })
  error?: string;

  @Prop({ type: Date })
  sentAt?: Date;
}

export const NotificationLogSchema =
  SchemaFactory.createForClass(NotificationLog);

// Compound index for querying a user's notification history sorted by most recent
NotificationLogSchema.index({ userId: 1, sentAt: -1 });
