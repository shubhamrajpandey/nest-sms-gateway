import { IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RouteHealthQueryDto {
  @ApiPropertyOptional({
    example: 24,
    default: 24,
    minimum: 1,
    maximum: 168,
    description: 'Evaluation time window in hours (default: 24 hours)',
  })
  @IsOptional()
  @Type(() => Number)
  @Min(1, { message: 'Window hours must be at least 1' })
  @Max(168, { message: 'Window hours cannot exceed 168 (7 days)' })
  hours?: number = 24;
}
