import { IsOptional, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DailyStatsQueryDto {
  @ApiPropertyOptional({
    description: 'Date in YYYY-MM-DD format (defaults to today)',
    example: '2025-06-01',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format',
  })
  date?: string;
}
