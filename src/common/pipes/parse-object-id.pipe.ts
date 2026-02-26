import {
  PipeTransform,
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ERROR_MESSAGES } from '../constants/index.js';

/**
 * Validation pipe that ensures a route parameter is a valid MongoDB ObjectId.
 *
 * Usage:
 *   @Get(':id')
 *   findOne(@Param('id', ParseObjectIdPipe) id: string) { ... }
 */
@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(ERROR_MESSAGES.INVALID_OBJECT_ID);
    }
    return value;
  }
}
