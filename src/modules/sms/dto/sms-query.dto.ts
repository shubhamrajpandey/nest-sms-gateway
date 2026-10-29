import { IsOptional, IsEnum, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { MessageStatus } from '../entities/sms-message.entity.js';

export class SmsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(MessageStatus, { message: 'Status must be PENDING, SENT, or FAILED' })
  status?: MessageStatus;
}

