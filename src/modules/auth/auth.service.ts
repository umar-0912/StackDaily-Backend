import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { User, UserDocument } from '../../database/schemas/user.schema.js';
import { SignupDto } from './dto/signup.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { AuthResponseDto } from './dto/auth-response.dto.js';
import { ERROR_MESSAGES } from '../../common/constants/index.js';
import { JwtPayload } from './strategies/jwt.strategy.js';

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

      // Hash the password
      const hashedPassword = await bcrypt.hash(dto.password, AuthService.BCRYPT_ROUNDS);

      // Create the user
      const user = await this.userModel.create({
        email: dto.email.toLowerCase(),
        username: dto.username.toLowerCase(),
        password: hashedPassword,
        subscribedTopics: dto.subscribedTopics || [],
      });

      // Generate tokens
      const tokens = await this.generateTokens(
        user._id.toString(),
        user.email,
        user.role,
      );

      this.logger.info(
        { userId: user._id, email: user.email },
        'Signup successful',
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
        error instanceof UnauthorizedException
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
}
