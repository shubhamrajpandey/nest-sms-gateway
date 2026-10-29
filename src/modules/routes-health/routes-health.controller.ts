import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { RoutesHealthService } from './routes-health.service.js';
import { RouteHealthQueryDto } from './dto/route-health-query.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

@ApiTags('Routes & Providers')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('routes')
export class RoutesHealthController {
  constructor(private readonly routesHealthService: RoutesHealthService) {}

  @ApiOperation({
    summary: 'Get 24-hour route performance & health analytics',
    description:
      'Aggregates attempt logs over the specified time window (default: 24h) and returns route balances, delivery success rates, average latency, and composite Health % score.',
  })
  @ApiResponse({
    status: 200,
    description: '24-hour route health analytics report with system overview.',
  })
  @Get('health')
  getRoutesHealth(@Query() query: RouteHealthQueryDto) {
    return this.routesHealthService.getRoutesHealth(query.hours);
  }
}
