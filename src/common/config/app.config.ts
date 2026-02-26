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

  // OpenAI
  OPENAI_API_KEY: Joi.string().required().messages({
    'any.required': 'OPENAI_API_KEY is required for AI-powered learning features.',
  }),
  OPENAI_MODEL: Joi.string().default('gpt-4'),

  // Firebase Cloud Messaging
  FCM_PROJECT_ID: Joi.string().required().messages({
    'any.required': 'FCM_PROJECT_ID is required for push notifications.',
  }),
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
