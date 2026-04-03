import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { User, UserDocument } from '../../../database/schemas/user.schema.js';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  type: 'access' | 'refresh';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectPinoLogger(JwtStrategy.name) private readonly logger: PinoLogger,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret')!,
    });
  }

  async validate(payload: JwtPayload): Promise<UserDocument> {
    if (payload.type !== 'access') {
      this.logger.warn('Attempted to use non-access token for authentication');
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.userModel.findById(payload.sub).lean().exec();

    if (!user) {
      this.logger.warn({ userId: payload.sub }, 'JWT validation failed: user not found');
      throw new UnauthorizedException('User not found');
    }

    if (!user.isActive) {
      this.logger.warn({ userId: payload.sub }, 'JWT validation failed: user account is inactive');
      throw new UnauthorizedException('User account is inactive');
    }

    this.logger.debug({ userId: payload.sub }, 'JWT validation successful');
    return user as UserDocument;
  }
}
