import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { randomInt, createHash } from 'crypto';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { User, UserDocument, OtpType } from '../../database/schemas/user.schema.js';
import { SignupDto } from './dto/signup.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { AuthResponseDto } from './dto/auth-response.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { ResendOtpDto } from './dto/resend-otp.dto.js';
import {
  ERROR_MESSAGES,
  SUBSCRIPTION_PLANS,
} from '../../common/constants/index.js';
import { JwtPayload } from './strategies/jwt.strategy.js';
import { EmailService } from '../email/email.service.js';

interface SafeUser {
  _id: unknown;
  email: string;
  username: string;
  role: string;
  isActive: boolean;
  subscribedTopics: unknown[];
  streak: { count: number; lastActiveDate: Date | null };
  [key: string]: unknown;
}

@Injectable()
export class AuthService {
  private static readonly BCRYPT_ROUNDS = 12;

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    @InjectPinoLogger(AuthService.name) private readonly logger: PinoLogger,
  ) {}

  // ─────────────────────────────── Signup ───────────────────────────────────

  async signup(dto: SignupDto): Promise<AuthResponseDto> {
    this.logger.info({ email: dto.email, username: dto.username }, 'Signup attempt');

    try {
      // Check for existing user by email
      const existingUser = await this.userModel
        .findOne({
          $or: [{ email: dto.email.toLowerCase() }, { username: dto.username.toLowerCase() }],
        })
        .lean()
        .exec();

      if (existingUser) {
        const field =
          existingUser.email === dto.email.toLowerCase() ? 'email' : 'username';
        this.logger.warn(
          { email: dto.email, username: dto.username, conflictField: field },
          'Signup failed: duplicate user',
        );
        throw new ConflictException(
          field === 'email'
            ? ERROR_MESSAGES.EMAIL_ALREADY_EXISTS
            : `An account with this username already exists.`,
        );
      }

      // Enforce free tier topic limit during signup
      const freeMaxTopics = SUBSCRIPTION_PLANS.free.maxTopics;
      if (
        dto.subscribedTopics &&
        freeMaxTopics !== null &&
        dto.subscribedTopics.length > freeMaxTopics
      ) {
        throw new BadRequestException(
          `New accounts can subscribe to a maximum of ${freeMaxTopics} topics.`,
        );
      }

      // Hash the password
      const hashedPassword = await bcrypt.hash(dto.password, AuthService.BCRYPT_ROUNDS);

      // Create the user (subscription defaults to free/active via schema)
      const user = await this.userModel.create({
        email: dto.email.toLowerCase(),
        username: dto.username.toLowerCase(),
        password: hashedPassword,
        subscribedTopics: dto.subscribedTopics || [],
      });

      // Populate subscribed topics before converting to response
      await user.populate({
        path: 'subscribedTopics',
        select: 'name slug icon',
      });

      // Generate and send email verification OTP
      const otp = this.generateOtp();
      await this.setOtpOnUser(
        user._id.toString(),
        otp,
        OtpType.EMAIL_VERIFICATION,
      );
      await this.emailService.sendOtpEmail(user.email, otp, 'verification');

      // Generate tokens
      const tokens = await this.generateTokens(
        user._id.toString(),
        user.email,
        user.role,
      );

      this.logger.info(
        { userId: user._id, email: user.email },
        'Signup successful, verification email sent',
      );

      // Convert to plain object and remove password
      const userObj = user.toObject();
      const { password: _password, ...userWithoutPassword } = userObj;

      return {
        ...tokens,
        user: userWithoutPassword as unknown as AuthResponseDto['user'],
      };
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof UnauthorizedException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      // Handle MongoDB duplicate key error
      if ((error as any)?.code === 11000) {
        this.logger.warn(
          { email: dto.email, keyPattern: (error as any).keyPattern },
          'Signup failed: duplicate key error',
        );
        throw new ConflictException(ERROR_MESSAGES.EMAIL_ALREADY_EXISTS);
      }

      this.logger.error(
        { err: error, email: dto.email },
        'Signup failed: unexpected error',
      );
      throw new InternalServerErrorException(ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
    }
  }

  // ──────────────────────────────── Login ────────────────────────────────────

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    this.logger.info({ email: dto.email }, 'Login attempt');

    try {
      // Find user with password field included
      const user = await this.userModel
        .findOne({ email: dto.email.toLowerCase() })
        .select('+password')
        .exec();

      if (!user) {
        this.logger.warn({ email: dto.email }, 'Login failed: user not found');
        throw new UnauthorizedException(ERROR_MESSAGES.INVALID_CREDENTIALS);
      }

      if (!user.isActive) {
        this.logger.warn(
          { email: dto.email, userId: user._id },
          'Login failed: account inactive',
        );
        throw new UnauthorizedException('Account is deactivated. Please contact support.');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(dto.password, user.password);

      if (!isPasswordValid) {
        this.logger.warn({ email: dto.email, userId: user._id }, 'Login failed: invalid password');
        throw new UnauthorizedException(ERROR_MESSAGES.INVALID_CREDENTIALS);
      }

      // Populate subscribed topics before converting to response
      await user.populate({
        path: 'subscribedTopics',
        select: 'name slug icon',
      });

      // If email not verified, send a fresh verification OTP
      if (!user.isEmailVerified) {
        const otp = this.generateOtp();
        await this.setOtpOnUser(
          user._id.toString(),
          otp,
          OtpType.EMAIL_VERIFICATION,
        );
        await this.emailService.sendOtpEmail(user.email, otp, 'verification');
        this.logger.info(
          { userId: user._id },
          'Login: email not verified, verification OTP sent',
        );
      }

      // Generate tokens
      const tokens = await this.generateTokens(
        user._id.toString(),
        user.email,
        user.role,
      );

      this.logger.info(
        { userId: user._id, email: user.email },
        'Login successful',
      );

      // Convert and remove password
      const userObj = user.toObject();
      const { password: _password, ...userWithoutPassword } = userObj;

      return {
        ...tokens,
        user: userWithoutPassword as unknown as AuthResponseDto['user'],
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ConflictException
      ) {
        throw error;
      }

      this.logger.error(
        { err: error, email: dto.email },
        'Login failed: unexpected error',
      );
      throw new InternalServerErrorException(ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
    }
  }

  // ──────────────────────────── Refresh Token ────────────────────────────────

  async refreshToken(userId: string): Promise<{ accessToken: string; refreshToken: string }> {
    this.logger.info({ userId }, 'Token refresh attempt');

    try {
      const user = await this.userModel.findById(userId).lean().exec();

      if (!user) {
        this.logger.warn({ userId }, 'Token refresh failed: user not found');
        throw new UnauthorizedException(ERROR_MESSAGES.USER_NOT_FOUND);
      }

      if (!user.isActive) {
        this.logger.warn({ userId }, 'Token refresh failed: account inactive');
        throw new UnauthorizedException('Account is deactivated.');
      }

      const tokens = await this.generateTokens(
        user._id.toString(),
        user.email,
        user.role,
      );

      this.logger.info({ userId }, 'Token refresh successful');
      return tokens;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.logger.error(
        { err: error, userId },
        'Token refresh failed: unexpected error',
      );
      throw new InternalServerErrorException(ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
    }
  }

  // ─────────────────────────── Generate Tokens ───────────────────────────────

  async generateTokens(
    userId: string,
    email: string,
    role: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessPayload: JwtPayload = {
      sub: userId,
      email,
      role,
      type: 'access',
    };

    const refreshPayload: JwtPayload = {
      sub: userId,
      email,
      role,
      type: 'refresh',
    };

    const accessOptions: JwtSignOptions = {
      expiresIn: this.configService.get('jwt.expiry', '1d'),
    };
    const refreshOptions: JwtSignOptions = {
      expiresIn: this.configService.get('jwt.refreshExpiry', '7d'),
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync({ ...accessPayload }, accessOptions),
      this.jwtService.signAsync({ ...refreshPayload }, refreshOptions),
    ]);

    this.logger.debug({ userId }, 'JWT tokens generated');

    return { accessToken, refreshToken };
  }

  // ─────────────────────────── Validate User ─────────────────────────────────

  async validateUser(userId: string): Promise<Omit<User, 'password'> | null> {
    this.logger.debug({ userId }, 'Validating user');

    try {
      const user = await this.userModel.findById(userId).lean().exec();

      if (!user) {
        this.logger.warn({ userId }, 'User validation failed: not found');
        return null;
      }

      this.logger.debug({ userId }, 'User validation successful');
      return user;
    } catch (error) {
      this.logger.error({ err: error, userId }, 'User validation failed: unexpected error');
      return null;
    }
  }

  // ─────────────────────────── Verify Email ───────────────────────────────────

  async verifyEmail(dto: VerifyEmailDto): Promise<{ message: string }> {
    this.logger.info({ email: dto.email }, 'Email verification attempt');

    const hashedOtp = this.hashOtp(dto.otp);

    // Atomic: find user matching all conditions and update in one operation
    // This prevents race conditions (double-verify, TOCTOU)
    const result = await this.userModel
      .findOneAndUpdate(
        {
          email: dto.email.toLowerCase(),
          isEmailVerified: false,
          otp: hashedOtp,
          otpType: OtpType.EMAIL_VERIFICATION,
          otpExpiry: { $gt: new Date() },
        },
        {
          $set: { isEmailVerified: true },
          $unset: { otp: 1, otpExpiry: 1, otpType: 1 },
        },
        { new: true },
      )
      .exec();

    if (!result) {
      // Determine the specific error for better UX
      const user = await this.userModel
        .findOne({ email: dto.email.toLowerCase() })
        .select('+otp +otpExpiry +otpType')
        .exec();

      if (!user) {
        throw new UnauthorizedException(ERROR_MESSAGES.INVALID_CREDENTIALS);
      }
      if (user.isEmailVerified) {
        throw new BadRequestException(ERROR_MESSAGES.EMAIL_ALREADY_VERIFIED);
      }
      if (!user.otp || user.otpType !== OtpType.EMAIL_VERIFICATION) {
        throw new BadRequestException(ERROR_MESSAGES.NO_PENDING_OTP);
      }
      if (user.otpExpiry && user.otpExpiry < new Date()) {
        throw new BadRequestException(ERROR_MESSAGES.OTP_EXPIRED);
      }
      throw new BadRequestException(ERROR_MESSAGES.OTP_INVALID);
    }

    this.logger.info(
      { userId: result._id, email: result.email },
      'Email verified successfully',
    );

    return { message: 'Email verified successfully.' };
  }

  // ─────────────────────────── Forgot Password ────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    this.logger.info({ email: dto.email }, 'Forgot password request');

    const user = await this.userModel
      .findOne({ email: dto.email.toLowerCase() })
      .exec();

    // Always return success to prevent email enumeration
    if (!user) {
      this.logger.warn(
        { email: dto.email },
        'Forgot password: email not found (silent)',
      );
      return {
        message: 'If an account exists with this email, an OTP has been sent.',
      };
    }

    const otp = this.generateOtp();
    await this.setOtpOnUser(user._id.toString(), otp, OtpType.PASSWORD_RESET);
    await this.emailService.sendOtpEmail(user.email, otp, 'reset');

    this.logger.info(
      { userId: user._id },
      'Password reset OTP sent',
    );

    return {
      message: 'If an account exists with this email, an OTP has been sent.',
    };
  }

  // ─────────────────────────── Reset Password ─────────────────────────────────

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    this.logger.info({ email: dto.email }, 'Password reset attempt');

    const hashedOtp = this.hashOtp(dto.otp);
    const hashedPassword = await bcrypt.hash(
      dto.newPassword,
      AuthService.BCRYPT_ROUNDS,
    );

    // Atomic: find user matching all conditions and update in one operation
    const result = await this.userModel
      .findOneAndUpdate(
        {
          email: dto.email.toLowerCase(),
          otp: hashedOtp,
          otpType: OtpType.PASSWORD_RESET,
          otpExpiry: { $gt: new Date() },
        },
        {
          $set: { password: hashedPassword },
          $unset: { otp: 1, otpExpiry: 1, otpType: 1 },
        },
        { new: true },
      )
      .exec();

    if (!result) {
      // Determine the specific error for better UX
      const user = await this.userModel
        .findOne({ email: dto.email.toLowerCase() })
        .select('+otp +otpExpiry +otpType')
        .exec();

      if (!user) {
        throw new UnauthorizedException(ERROR_MESSAGES.INVALID_CREDENTIALS);
      }
      if (!user.otp || user.otpType !== OtpType.PASSWORD_RESET) {
        throw new BadRequestException(ERROR_MESSAGES.NO_PENDING_OTP);
      }
      if (user.otpExpiry && user.otpExpiry < new Date()) {
        throw new BadRequestException(ERROR_MESSAGES.OTP_EXPIRED);
      }
      throw new BadRequestException(ERROR_MESSAGES.OTP_INVALID);
    }

    this.logger.info(
      { userId: result._id },
      'Password reset successfully',
    );

    return {
      message: 'Password reset successfully. Please log in with your new password.',
    };
  }

  // ─────────────────────────── Resend OTP ─────────────────────────────────────

  async resendOtp(dto: ResendOtpDto): Promise<{ message: string }> {
    this.logger.info({ email: dto.email, type: dto.type }, 'Resend OTP request');

    const user = await this.userModel
      .findOne({ email: dto.email.toLowerCase() })
      .exec();

    if (!user) {
      return { message: 'If an account exists, an OTP has been sent.' };
    }

    const otpType =
      dto.type === 'email_verification'
        ? OtpType.EMAIL_VERIFICATION
        : OtpType.PASSWORD_RESET;
    const emailType =
      dto.type === 'email_verification' ? 'verification' : 'reset';

    const otp = this.generateOtp();
    await this.setOtpOnUser(user._id.toString(), otp, otpType);
    await this.emailService.sendOtpEmail(user.email, otp, emailType);

    this.logger.info(
      { userId: user._id, type: dto.type },
      'OTP resent successfully',
    );

    return { message: 'If an account exists, an OTP has been sent.' };
  }

  // ─────────────────────────── Private OTP Helpers ────────────────────────────

  private generateOtp(): string {
    return randomInt(100000, 999999).toString();
  }

  private hashOtp(otp: string): string {
    return createHash('sha256').update(otp).digest('hex');
  }

  private async setOtpOnUser(
    userId: string,
    otp: string,
    type: OtpType,
  ): Promise<void> {
    const hashedOtp = this.hashOtp(otp);
    await this.userModel
      .findByIdAndUpdate(userId, {
        $set: {
          otp: hashedOtp,
          otpExpiry: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
          otpType: type,
        },
      })
      .exec();
  }
}
