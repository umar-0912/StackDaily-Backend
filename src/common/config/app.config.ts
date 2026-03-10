import { registerAs } from '@nestjs/config';
import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // Server
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  CORS_ORIGINS: Joi.string().default('*'),

  // Database
  MONGODB_URI: Joi.string().uri().required().messages({
    'any.required': 'MONGODB_URI is required. Provide a valid MongoDB connection string.',
  }),

  // JWT
  JWT_SECRET: Joi.string().min(32).required().messages({
    'any.required': 'JWT_SECRET is required. Use a strong random string (min 32 chars).',
    'string.min': 'JWT_SECRET must be at least 32 characters for security.',
  }),
  JWT_EXPIRY: Joi.string().default('1d'),
  JWT_REFRESH_EXPIRY: Joi.string().default('7d'),

  // OpenAI (optional — AI generation disabled without it)
  OPENAI_API_KEY: Joi.string().optional().default(''),
  OPENAI_MODEL: Joi.string().default('gpt-4o-mini'),

  // Firebase Cloud Messaging (optional — push notifications disabled without it)
  FCM_PROJECT_ID: Joi.string().optional().default(''),
  FIREBASE_SERVICE_ACCOUNT_JSON: Joi.string().optional().allow('').default(''),
  FIREBASE_SERVICE_ACCOUNT_PATH: Joi.string().optional().allow('').default(''),

  // Razorpay (optional — payments disabled without it)
  RAZORPAY_KEY_ID: Joi.string().optional().default(''),
  RAZORPAY_KEY_SECRET: Joi.string().optional().default(''),
  RAZORPAY_WEBHOOK_SECRET: Joi.string().optional().default(''),
  RAZORPAY_PLAN_ID: Joi.string().optional().default(''),

  // Email — Brevo (optional — email features disabled without it)
  BREVO_API_KEY: Joi.string().optional().allow('').default(''),
  EMAIL_FROM_NAME: Joi.string().optional().default('StackDaily'),
  EMAIL_FROM_ADDRESS: Joi.string().optional().default('stackdaily.app@gmail.com'),

  // Google Sign-In (optional — Google auth disabled without it)
  GOOGLE_CLIENT_ID: Joi.string().optional().allow('').default(''),
});

export const appConfig = registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  corsOrigins: process.env.CORS_ORIGINS || '*',
}));

export const databaseConfig = registerAs('database', () => ({
  uri: process.env.MONGODB_URI,
}));

export const jwtConfig = registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET,
  expiry: process.env.JWT_EXPIRY || '1d',
  refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
}));

export const openaiConfig = registerAs('openai', () => ({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL || 'gpt-4',
}));

export const fcmConfig = registerAs('fcm', () => ({
  projectId: process.env.FCM_PROJECT_ID,
}));

export const razorpayConfig = registerAs('razorpay', () => ({
  keyId: process.env.RAZORPAY_KEY_ID,
  keySecret: process.env.RAZORPAY_KEY_SECRET,
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  planId: process.env.RAZORPAY_PLAN_ID,
}));

export const emailConfig = registerAs('email', () => ({
  brevoApiKey: process.env.BREVO_API_KEY || '',
  fromName: process.env.EMAIL_FROM_NAME || 'StackDaily',
  fromAddress: process.env.EMAIL_FROM_ADDRESS || 'stackdaily.app@gmail.com',
}));

export const googleConfig = registerAs('google', () => ({
  clientId: process.env.GOOGLE_CLIENT_ID || '',
}));
