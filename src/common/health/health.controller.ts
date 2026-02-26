import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { APP_META } from '../constants/index.js';

class HealthCheckResponse {
  status!: string;
  uptime!: number;
  timestamp!: string;
  version!: string;
  database!: string;
}

@ApiTags('Health')
@Controller('api/v1/health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get()
  @ApiOperation({ summary: 'Application health check' })
  @ApiOkResponse({
    description: 'The service is healthy.',
    type: HealthCheckResponse,
  })
  check(): HealthCheckResponse {
    const dbState = this.connection.readyState;
    const dbStatus = dbState === 1 ? 'connected' : dbState === 2 ? 'connecting' : 'disconnected';

    return {
      status: dbState === 1 ? 'ok' : 'degraded',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: APP_META.APP_VERSION,
      database: dbStatus,
    };
  }
}
