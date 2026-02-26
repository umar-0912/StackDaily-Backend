import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

@Schema({
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform(_doc, ret: Record<string, unknown>) {
      delete ret['password'];
      delete ret['__v'];
      return ret;
    },
  },
  toObject: {
    virtuals: true,
  },
})
export class User {
  @Prop({
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  email: string;

  @Prop({
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  username: string;

  @Prop({
    type: String,
    required: true,
    select: false,
  })
  password: string;

  @Prop({
    type: [{ type: Types.ObjectId, ref: 'Topic' }],
    default: [],
    index: true,
  })
  subscribedTopics: Types.ObjectId[];

  @Prop({ type: String })
  fcmToken?: string;

  @Prop({
    type: {
      count: { type: Number, default: 0 },
      lastActiveDate: { type: Date },
    },
    default: { count: 0, lastActiveDate: null },
    _id: false,
  })
  streak: {
    count: number;
    lastActiveDate: Date | null;
  };

  @Prop({
    type: String,
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  @Prop({
    type: Boolean,
    default: true,
  })
  isActive: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Compound index for querying active users by subscribed topics
UserSchema.index({ isActive: 1, subscribedTopics: 1 });
