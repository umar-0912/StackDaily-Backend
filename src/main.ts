import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger as PinoLogger } from 'nestjs-pino';
import { json, urlencoded } from 'express';

import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import { TransformInterceptor } from './common/interceptors/transform.interceptor.js';
import { APP_META } from './common/constants/index.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // ─── Body Size Limits ────────────────────────────────────────
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));

  // ─── Request Timeout ─────────────────────────────────────────
  const server = app.getHttpServer();
  server.setTimeout(30_000); // 30 second timeout

  // Use Pino as the application logger
  app.useLogger(app.get(PinoLogger));

  const config = app.get(ConfigService);
  const port = config.get<number>('app.port', 3000);
  const nodeEnv = config.get<string>('app.nodeEnv', 'development');

  // ─── Global Pipes ───────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ─── Global Filters ─────────────────────────────────────────
  app.useGlobalFilters(new HttpExceptionFilter());

  // ─── Global Interceptors ────────────────────────────────────
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
  );

  // ─── CORS ───────────────────────────────────────────────────
  app.enableCors({
    origin: config.get<string>('app.corsOrigins', '*').split(','),
    credentials: true,
  });

  // ─── Swagger ────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle(APP_META.APP_NAME)
    .setDescription(APP_META.APP_DESCRIPTION)
    .setVersion(APP_META.APP_VERSION)
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your JWT token',
      },
      'JWT-auth',
    )
    .addTag('Health', 'Health check endpoints')
    .addTag('Auth', 'Authentication & authorization')
    .addTag('Users', 'User profile & subscription management')
    .addTag('Topics', 'Learning topics management')
    .addTag('Questions', 'Question bank management')
    .addTag('AI Answers', 'AI-generated answer management')
    .addTag('Notifications', 'Push notification system')
    .addTag('Daily Flow', 'Daily learning feed & orchestration')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // ─── Graceful Shutdown ──────────────────────────────────────
  app.enableShutdownHooks();

  // ─── Start ──────────────────────────────────────────────────
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(
    `${APP_META.APP_NAME} v${APP_META.APP_VERSION} running on port ${port} [${nodeEnv}]`,
  );
  logger.log(`Swagger docs available at http://localhost:${port}/docs`);
}

bootstrap();
