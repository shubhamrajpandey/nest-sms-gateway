import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SmsProvider } from './entities/sms-provider.entity.js';
import { ProviderAttempt } from '../provider-attempts/entities/provider-attempts.entity.js';
import { ProvidersService } from './providers.service.js';
import { ProvidersController } from './providers.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([SmsProvider, ProviderAttempt])],
  controllers: [ProvidersController],
  providers: [ProvidersService],
  exports: [ProvidersService, TypeOrmModule],
})
export class ProvidersModule {}

