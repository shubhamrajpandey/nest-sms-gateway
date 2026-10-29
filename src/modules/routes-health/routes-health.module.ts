import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SmsProvider } from '../providers/entities/sms-provider.entity.js';
import { ProviderAttempt } from '../provider-attempts/entities/provider-attempts.entity.js';
import { RoutesHealthService } from './routes-health.service.js';
import { RoutesHealthController } from './routes-health.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([SmsProvider, ProviderAttempt])],
  controllers: [RoutesHealthController],
  providers: [RoutesHealthService],
  exports: [RoutesHealthService, TypeOrmModule],
})
export class RoutesHealthModule {}

