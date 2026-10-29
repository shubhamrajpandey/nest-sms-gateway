import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SmsMessage } from './entities/sms-message.entity.js';
import { ProviderAttempt } from '../provider-attempts/entities/provider-attempts.entity.js';
import { SmsService } from './sms.service.js';
import { SmsController } from './sms.controller.js';
import { ProvidersModule } from '../providers/providers.module.js';
import { WalletModule } from '../wallet/wallet.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([SmsMessage, ProviderAttempt]),
    ProvidersModule,
    WalletModule,
  ],
  controllers: [SmsController],
  providers: [SmsService],
  exports: [SmsService, TypeOrmModule],
})
export class SmsModule {}

