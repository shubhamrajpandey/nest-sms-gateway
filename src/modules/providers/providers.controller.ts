import { Controller, Get, UseGuards } from '@nestjs/common';
import { ProvidersService } from './providers.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

@UseGuards(JwtAuthGuard)
@Controller('providers')
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get()
  getAllProviders() {
    return this.providersService.getAllProviders();
  }
}

