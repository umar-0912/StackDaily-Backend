import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

export enum SubscriptionPlan {
  FREE = 'free',
  PRO = 'pro',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export enum SubscriptionTier {
  MONTHLY = 'monthly',
  HALF_YEARLY = 'half_yearly',
  YEARLY = 'yearly',
}

export enum OtpType {
  EMAIL_VERIFICATION = 'email_verification',
  PASSWORD_RESET = 'password_reset',
}

export enum AuthProvider {
  LOCAL = 'local',
  GOOGLE = 'google',
}

@Schema({
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform(_doc, ret: Record<string, unknown>) {
      delete ret['password'];
      delete ret['googleId'];
      delete ret['otp'];
      delete ret['otpExpiry'];
      delete ret['otpType'];
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
    trim: true,
  })
  name: string;

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
    required: false,
    select: false,
  })
  password?: string;

  @Prop({
    type: String,
    default: null,
    sparse: true,
    index: true,
  })
  googleId?: string | null;

  @Prop({
    type: String,
    enum: AuthProvider,
    default: AuthProvider.LOCAL,
  })
  authProvider: AuthProvider;

  @Prop({
    type: [{ type: Types.ObjectId, ref: 'Topic' }],
    default: [],
    index: true,
  })
  subscribedTopics: Types.ObjectId[];

  @Prop({
    type: [{ type: Types.ObjectId, ref: 'Topic' }],
    default: [],
  })
  topicSubscriptionHistory: Types.ObjectId[];

  @Prop({ type: String })
  fcmToken?: string;

  @Prop({
    type: {
      count: { type: Number, default: 0 },
      maxStreak: { type: Number, default: 0 },
      lastActiveDate: { type: Date },
    },
    default: { count: 0, maxStreak: 0, lastActiveDate: null },
    _id: false,
  })
  streak: {
    count: number;
    maxStreak: number;
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

  @Prop({ type: Boolean, default: false })
  isEmailVerified: boolean;

  @Prop({ type: String, select: false })
  otp?: string;

  @Prop({ type: Date, select: false })
  otpExpiry?: Date;

  @Prop({ type: String, enum: OtpType, select: false })
  otpType?: OtpType;

  @Prop({
    type: {
      plan: {
        type: String,
        enum: SubscriptionPlan,
        default: SubscriptionPlan.FREE,
      },
      status: {
        type: String,
        enum: SubscriptionStatus,
        default: SubscriptionStatus.ACTIVE,
      },
      tier: {
        type: String,
        enum: SubscriptionTier,
        default: null,
      },
      startDate: { type: Date, default: null },
      endDate: { type: Date, default: null },
      cancelledAt: { type: Date, default: null },
    },
    default: {
      plan: SubscriptionPlan.FREE,
      status: SubscriptionStatus.ACTIVE,
      tier: null,
      startDate: null,
      endDate: null,
      cancelledAt: null,
    },
    _id: false,
  })
  subscription: {
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
    tier: SubscriptionTier | null;
    startDate: Date | null;
    endDate: Date | null;
    cancelledAt: Date | null;
  };

  @Prop({ type: String, default: null, index: true })
  razorpayCustomerId: string | null;

  @Prop({ type: String, default: null, index: true })
  razorpaySubscriptionId: string | null;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Compound index for querying active users by subscribed topics
UserSchema.index({ isActive: 1, subscribedTopics: 1 });

// Index for querying users by subscription plan (admin dashboard, stats)
UserSchema.index({ 'subscription.plan': 1 });

// Sparse unique index for Google Sign-In users
UserSchema.index({ googleId: 1 }, { unique: true, sparse: true });
