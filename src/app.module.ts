import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { v4 as uuidv4 } from 'uuid';
import { Request } from 'express';

import {
  validationSchema,
  appConfig,
  databaseConfig,
  jwtConfig,
  openaiConfig,
  fcmConfig,
} from './common/config/index.js';
import { HEADERS } from './common/constants/index.js';
import { HealthController } from './common/health/health.controller.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { TopicsModule } from './modules/topics/topics.module.js';
import { QuestionsModule } from './modules/questions/questions.module.js';
import { AiAnswersModule } from './modules/ai-answers/ai-answers.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { DailyFlowModule } from './modules/daily-flow/daily-flow.module.js';

@Module({
  imports: [
    // ─── Configuration ──────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig, openaiConfig, fcmConfig],
      validationSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
    }),

    // ─── Database ───────────────────────────────────────────────
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('database.uri'),
      }),
    }),

    // ─── Logging (pino) ─────────────────────────────────────────
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isDev = config.get<string>('app.nodeEnv') === 'development';

        return {
          pinoHttp: {
            level: isDev ? 'debug' : 'info',
            transport: isDev
              ? {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    singleLine: true,
                    translateTime: 'SYS:standard',
                    ignore: 'pid,hostname',
                  },
                }
              : undefined,
            genReqId: (req: Request) =>
              (req.headers[HEADERS.CORRELATION_ID] as string) || uuidv4(),
            customProps: (req: Request) => ({
              correlationId:
                (req.headers[HEADERS.CORRELATION_ID] as string) ||
                req.id,
            }),
            autoLogging: true,
            serializers: {
              req: (req: Record<string, unknown>) => ({
                id: req['id'],
                method: req['method'],
                url: req['url'],
              }),
              res: (res: Record<string, unknown>) => ({
                statusCode: res['statusCode'],
              }),
            },
          },
        };
      },
    }),

    // ─── Rate Limiting ──────────────────────────────────────────
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('THROTTLE_TTL', 60_000),
            limit: config.get<number>('THROTTLE_LIMIT', 60),
          },
        ],
      }),
    }),

    // ─── Scheduling ─────────────────────────────────────────────
    ScheduleModule.forRoot(),

    // ─── Feature Modules ──────────────────────────────────────────
    AuthModule,
    UsersModule,
    TopicsModule,
    QuestionsModule,
    AiAnswersModule,
    NotificationsModule,
    DailyFlowModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
