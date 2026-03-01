import {
  Controller,
  Post,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { PaymentsService } from './payments.service.js';
import { SubscribeResponseDto } from './dto/subscribe-response.dto.js';

@ApiTags('Payments')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('api/v1/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // ──────────────────── Subscribe ────────────────────────────────────────────

  @Post('subscribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create a Razorpay subscription',
    description:
      'Creates a Razorpay subscription and returns the short_url for the user to complete payment via UPI.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Subscription created, returns shortUrl for checkout',
    type: SubscribeResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Already has active Pro subscription',
  })
  async subscribe(
    @CurrentUser('_id') userId: string,
  ): Promise<SubscribeResponseDto> {
    return this.paymentsService.createSubscription(userId.toString());
  }

  // ──────────────────── Cancel ───────────────────────────────────────────────

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel active subscription',
    description:
      'Cancels the current Razorpay subscription at the end of the billing cycle. User retains Pro access until then.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Subscription cancellation initiated',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'No active subscription found',
  })
  async cancel(
    @CurrentUser('_id') userId: string,
  ): Promise<{ message: string }> {
    await this.paymentsService.cancelSubscription(userId.toString());
    return {
      message:
        'Subscription cancellation initiated. You will retain access until the current period ends.',
    };
  }
}
