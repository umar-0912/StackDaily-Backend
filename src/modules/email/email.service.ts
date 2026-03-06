import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { setDefaultResultOrder } from 'node:dns';

// Force IPv4 DNS resolution — Railway doesn't support IPv6 outbound
setDefaultResultOrder('ipv4first');

@Injectable()
export class EmailService {
  private transporter: Transporter | null = null;
  private readonly isProduction: boolean;

  constructor(
    private readonly configService: ConfigService,
    @InjectPinoLogger(EmailService.name) private readonly logger: PinoLogger,
  ) {
    this.isProduction =
      this.configService.get<string>('app.nodeEnv') === 'production';
    const user = this.configService.get<string>('email.user');
    const pass = this.configService.get<string>('email.pass');

    if (user && pass) {
      const port = this.configService.get<number>('email.port');
      const smtpOptions: SMTPTransport.Options & { family?: number } = {
        host: this.configService.get<string>('email.host'),
        port,
        secure: port === 465, // SSL on 465, STARTTLS on 587
        auth: { user, pass },
        family: 4,
      };
      this.transporter = nodemailer.createTransport(
        smtpOptions as SMTPTransport.Options,
      );
      this.logger.info('Email transporter initialized');
    } else {
      this.logger.warn(
        'SMTP credentials not configured — email sending disabled',
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
    if (!this.transporter) {
      if (this.isProduction) {
        this.logger.error(
          { to, type },
          'Email send failed — no transporter configured in production',
        );
        throw new InternalServerErrorException(
          'Email service is not configured. Please contact support.',
        );
      }
      this.logger.warn({ to, type }, 'Email send skipped — no transporter (dev mode)');
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

    const from = this.configService.get<string>('email.from');

    try {
      await this.transporter.sendMail({ from, to, subject, html });
      this.logger.info({ to, type }, 'OTP email sent');
    } catch (error) {
      this.logger.error({ err: error, to, type }, 'Failed to send OTP email');
      throw error;
    }
  }
}
