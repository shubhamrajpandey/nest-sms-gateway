import { IsOptional, IsEnum, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MessageStatus } from '../entities/sms-message.entity.js';

export class SmsQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20, description: 'Number of items per page' })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    enum: MessageStatus,
    description: 'Filter logs by status: PENDING, SENT, FAILED',
  })
  @IsOptional()
  @IsEnum(MessageStatus, { message: 'Status must be PENDING, SENT, or FAILED' })
  status?: MessageStatus;

  @ApiPropertyOptional({
    example: '9841234567',
    description: 'Filter logs by recipient phone number',
  })
  @IsOptional()
  @IsString()
  number?: string;

  @ApiPropertyOptional({
    example: '2026-10-29',
    description: 'Filter logs by date (format: YYYY-MM-DD)',
  })
  @IsOptional()
  @IsString()
  date?: string;
}
