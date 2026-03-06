import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private resend: Resend | null = null;
  private readonly from: string;
  private readonly isProduction: boolean;

  constructor(
    private readonly configService: ConfigService,
    @InjectPinoLogger(EmailService.name) private readonly logger: PinoLogger,
  ) {
    this.isProduction =
      this.configService.get<string>('app.nodeEnv') === 'production';
    this.from = this.configService.get<string>('email.from')!;
    const apiKey = this.configService.get<string>('email.resendApiKey');

    if (apiKey) {
      this.resend = new Resend(apiKey);
      this.logger.info('Resend email client initialized');
    } else {
      this.logger.warn(
        'RESEND_API_KEY not configured — email sending disabled',
      );
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async sendOtpEmail(
    to: string,
    otp: string,
    type: 'verification' | 'reset',
  ): Promise<void> {
    if (!this.resend) {
      if (this.isProduction) {
        this.logger.error(
          { to, type },
          'Email send failed — Resend not configured in production',
        );
        throw new InternalServerErrorException(
          'Email service is not configured. Please contact support.',
        );
      }
      this.logger.warn({ to, type }, 'Email send skipped — no Resend client (dev mode)');
      return;
    }

    const subject =
      type === 'verification'
        ? 'StackDaily — Verify Your Email'
        : 'StackDaily — Reset Your Password';

    const safeOtp = this.escapeHtml(otp);

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #6200EE;">StackDaily</h2>
        <p>Your ${type === 'verification' ? 'email verification' : 'password reset'} code is:</p>
        <div style="background: #F5F5F5; padding: 20px; text-align: center; border-radius: 8px; margin: 16px 0;">
          <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #6200EE;">${safeOtp}</span>
        </div>
        <p style="color: #666; font-size: 14px;">This code expires in 10 minutes.</p>
        <p style="color: #666; font-size: 14px;">If you didn't request this, please ignore this email.</p>
      </div>
    `;

    try {
      const { error } = await this.resend.emails.send({
        from: this.from,
        to,
        subject,
        html,
      });

      if (error) {
        this.logger.error({ err: error, to, type }, 'Resend API returned error');
        throw new Error(error.message);
      }

      this.logger.info({ to, type }, 'OTP email sent via Resend');
    } catch (error) {
      this.logger.error({ err: error, to, type }, 'Failed to send OTP email');
      throw error;
    }
  }
}
