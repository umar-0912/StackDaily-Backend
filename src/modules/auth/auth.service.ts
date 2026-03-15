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
import { OAuth2Client } from 'google-auth-library';

import { User, UserDocument, OtpType, AuthProvider } from '../../database/schemas/user.schema.js';
import { SignupDto } from './dto/signup.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { AuthResponseDto } from './dto/auth-response.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { ResendOtpDto } from './dto/resend-otp.dto.js';
import { GoogleSignInDto } from './dto/google-signin.dto.js';
import {
  ERROR_MESSAGES,
  SUBSCRIPTION_PLANS,
} from '../../common/constants/index.js';
import { JwtPayload } from './strategies/jwt.strategy.js';
import { EmailService } from '../email/email.service.js';

interface SafeUser {
  _id: unknown;
  email: string;
  name: string;
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
  private readonly googleClient: OAuth2Client;
  private readonly googleClientId: string;

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    @InjectPinoLogger(AuthService.name) private readonly logger: PinoLogger,
  ) {
    this.googleClientId = this.configService.get<string>('google.clientId', '');
    this.googleClient = new OAuth2Client(this.googleClientId);
  }

  // ─────────────────────────────── Signup ───────────────────────────────────

  async signup(dto: SignupDto): Promise<AuthResponseDto> {
    this.logger.info({ email: dto.email, name: dto.name }, 'Signup attempt');

    try {
      // Check for existing user by email
      const existingUser = await this.userModel
        .findOne({ email: dto.email.toLowerCase() })
        .lean()
        .exec();

      if (existingUser) {
        this.logger.warn(
          { email: dto.email },
          'Signup failed: duplicate email',
        );
        throw new ConflictException(ERROR_MESSAGES.EMAIL_ALREADY_EXISTS);
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

      // Auto-generate unique username from name
      const username = await this.generateUniqueUsername(dto.name, dto.email);

      // Create the user (subscription defaults to free/active via schema)
      const user = await this.userModel.create({
        email: dto.email.toLowerCase(),
        name: dto.name.trim(),
        username,
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
      // Fire-and-forget: send email in background to avoid blocking the response
      this.emailService.sendOtpEmail(user.email, otp, 'verification').catch((err) => {
        this.logger.error({ err, userId: user._id, email: user.email }, 'Failed to send verification OTP email');
      });

      // Generate tokens
      const tokens = await this.generateTokens(
        user._id.toString(),
        user.email,
        user.role,
      );

      this.logger.info(
        { userId: user._id, email: user.email },
        'Signup successful, verification email queued',
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

      // Google-only users have no password — reject email+password login
      if (!user.password) {
        this.logger.warn(
          { email: dto.email, userId: user._id },
          'Login failed: no password set (Google-only account)',
        );
        throw new UnauthorizedException(ERROR_MESSAGES.INVALID_CREDENTIALS);
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
        this.emailService.sendOtpEmail(user.email, otp, 'verification').catch((err) => {
          this.logger.error({ err, userId: user._id }, 'Failed to send verification OTP email on login');
        });
        this.logger.info(
          { userId: user._id },
          'Login: email not verified, verification OTP queued',
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
    this.emailService.sendOtpEmail(user.email, otp, 'reset').catch((err) => {
      this.logger.error({ err, userId: user._id }, 'Failed to send password reset OTP email');
    });

    this.logger.info(
      { userId: user._id },
      'Password reset OTP queued',
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
    this.emailService.sendOtpEmail(user.email, otp, emailType).catch((err) => {
      this.logger.error({ err, userId: user._id, type: dto.type }, 'Failed to resend OTP email');
    });

    this.logger.info(
      { userId: user._id, type: dto.type },
      'OTP resend queued',
    );

    return { message: 'If an account exists, an OTP has been sent.' };
  }

  // ─────────────────────────── Google Sign-In ─────────────────────────────────

  async googleSignIn(dto: GoogleSignInDto): Promise<AuthResponseDto> {
    this.logger.info('Google Sign-In attempt');

    if (!this.googleClientId) {
      this.logger.error('Google Sign-In failed: GOOGLE_CLIENT_ID not configured');
      throw new InternalServerErrorException(
        'Google Sign-In is not configured. Please contact support.',
      );
    }

    // 1. Verify Google ID token
    let payload: {
      sub: string;
      email: string;
      name?: string;
      email_verified?: boolean;
    };

    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: dto.idToken,
        audience: this.googleClientId,
      });
      const ticketPayload = ticket.getPayload();

      if (!ticketPayload || !ticketPayload.email || !ticketPayload.sub) {
        throw new Error('Missing required fields in Google token payload');
      }

      payload = {
        sub: ticketPayload.sub,
        email: ticketPayload.email,
        name: ticketPayload.name,
        email_verified: ticketPayload.email_verified,
      };
    } catch (error) {
      this.logger.warn(
        { err: error },
        'Google Sign-In failed: invalid ID token',
      );
      throw new UnauthorizedException('Invalid Google ID token.');
    }

    // 2. Find existing user by googleId (returning Google user)
    let user = await this.userModel
      .findOne({ googleId: payload.sub })
      .populate({ path: 'subscribedTopics', select: 'name slug icon' })
      .exec();

    if (user) {
      this.logger.info(
        { userId: user._id, email: user.email },
        'Google Sign-In: returning user',
      );
      const tokens = await this.generateTokens(
        user._id.toString(),
        user.email,
        user.role,
      );
      const userObj = user.toObject();
      const { password: _password, ...userWithoutPassword } = userObj;
      return {
        ...tokens,
        user: userWithoutPassword as unknown as AuthResponseDto['user'],
      };
    }

    // 3. Find existing user by email (account linking)
    user = await this.userModel
      .findOne({ email: payload.email.toLowerCase() })
      .populate({ path: 'subscribedTopics', select: 'name slug icon' })
      .exec();

    if (user) {
      // Link Google account to existing email+password user
      user.googleId = payload.sub;
      user.isEmailVerified = true; // Google verifies email
      // Backfill name if missing (e.g. legacy users without name)
      if (!user.name?.trim()) {
        user.name =
          payload.name?.trim() || payload.email.split('@')[0] || 'User';
      }
      await user.save();

      this.logger.info(
        { userId: user._id, email: user.email },
        'Google Sign-In: linked Google account to existing user',
      );

      const tokens = await this.generateTokens(
        user._id.toString(),
        user.email,
        user.role,
      );
      const userObj = user.toObject();
      const { password: _password, ...userWithoutPassword } = userObj;
      return {
        ...tokens,
        user: userWithoutPassword as unknown as AuthResponseDto['user'],
      };
    }

    // 4. Create new user (Google-only, no password, auto-verified)
    const googleName =
      payload.name?.trim() || payload.email.split('@')[0] || 'User';
    const username = await this.generateUniqueUsername(
      googleName,
      payload.email,
    );

    const newUser = await this.userModel.create({
      email: payload.email.toLowerCase(),
      name: googleName,
      username,
      googleId: payload.sub,
      authProvider: AuthProvider.GOOGLE,
      isEmailVerified: true, // Google verifies email
    });

    await newUser.populate({
      path: 'subscribedTopics',
      select: 'name slug icon',
    });

    const tokens = await this.generateTokens(
      newUser._id.toString(),
      newUser.email,
      newUser.role,
    );

    this.logger.info(
      { userId: newUser._id, email: newUser.email, username },
      'Google Sign-In: new user created',
    );

    const userObj = newUser.toObject();
    const { password: _password, ...userWithoutPassword } = userObj;
    return {
      ...tokens,
      user: userWithoutPassword as unknown as AuthResponseDto['user'],
    };
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

  // ──────────────────────── Private Google Helpers ─────────────────────────

  /**
   * Generates a unique username from Google display name or email prefix.
   * Appends random digits if the base name is already taken.
   */
  private async generateUniqueUsername(
    displayName?: string,
    email?: string,
  ): Promise<string> {
    // Extract base: "John Doe" → "johndoe", or "user@gmail.com" → "user"
    const raw = displayName
      ? displayName.replace(/\s+/g, '').toLowerCase()
      : (email?.split('@')[0] ?? 'user').toLowerCase();

    // Keep only alphanumeric, truncate to 20 chars
    const base = raw.replace(/[^a-z0-9]/g, '').slice(0, 20) || 'user';

    // Check if base username is available
    const exists = await this.userModel.exists({ username: base }).exec();
    if (!exists) return base;

    // Append random digits until unique (max 10 attempts, then fallback)
    for (let i = 0; i < 10; i++) {
      const candidate = `${base}${randomInt(100, 9999)}`;
      const taken = await this.userModel
        .exists({ username: candidate })
        .exec();
      if (!taken) return candidate;
    }

    // Ultimate fallback: base + timestamp
    return `${base}${Date.now().toString(36)}`;
  }
}
