import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ProvidersService } from './providers.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

@ApiTags('Routes & Providers')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('providers')
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @ApiOperation({
    summary: 'List all SMS providers',
    description: 'Retrieves configured provider routes (ROUTE_A, ROUTE_B, ROUTE_C) with priorities, failure rates, and simulated balances.',
  })
  @ApiResponse({ status: 200, description: 'List of configured SMS provider routes.' })
  @Get()
  getAllProviders() {
    return this.providersService.getAllProviders();
  }
}
