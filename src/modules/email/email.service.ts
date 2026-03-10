import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

@Injectable()
export class EmailService {
  private readonly apiKey: string;
  private readonly fromName: string;
  private readonly fromAddress: string;
  private readonly isProduction: boolean;

  constructor(
    private readonly configService: ConfigService,
    @InjectPinoLogger(EmailService.name) private readonly logger: PinoLogger,
  ) {
    this.isProduction =
      this.configService.get<string>('app.nodeEnv') === 'production';
    this.apiKey = this.configService.get<string>('email.brevoApiKey')!;
    this.fromName = this.configService.get<string>('email.fromName')!;
    this.fromAddress = this.configService.get<string>('email.fromAddress')!;

    if (this.apiKey) {
      this.logger.info('Brevo email client initialized');
    } else {
      this.logger.warn(
        'BREVO_API_KEY not configured — email sending disabled',
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
    if (!this.apiKey) {
      if (this.isProduction) {
        this.logger.error(
          { to, type },
          'Email send failed — Brevo not configured in production',
        );
        throw new InternalServerErrorException(
          'Email service is not configured. Please contact support.',
        );
      }
      this.logger.warn({ to, type }, 'Email send skipped — no Brevo API key (dev mode)');
      return;
    }

    const subject =
      type === 'verification'
        ? 'StackDaily — Verify Your Email'
        : 'StackDaily — Reset Your Password';

    const safeOtp = this.escapeHtml(otp);

    const htmlContent = `
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
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': this.apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { name: this.fromName, email: this.fromAddress },
          to: [{ email: to }],
          subject,
          htmlContent,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        this.logger.error(
          { status: response.status, err: errorBody, to, type },
          'Brevo API returned error',
        );
        throw new Error(
          (errorBody as any)?.message || `Brevo API error: ${response.status}`,
        );
      }

      this.logger.info({ to, type }, 'OTP email sent via Brevo');
    } catch (error) {
      this.logger.error({ err: error, to, type }, 'Failed to send OTP email');
      throw error;
    }
  }
}
