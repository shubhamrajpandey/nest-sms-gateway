import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SmsProvider } from '../../modules/providers/entities/sms-provider.entity.js';

//When the app starts, it checks if providers are present; if not, it adds them.

@Injectable()
export class ProviderSeed implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProviderSeed.name);

  constructor(
    @InjectRepository(SmsProvider)
    private readonly providerRepository: Repository<SmsProvider>,
  ) {}

  async onApplicationBootstrap() {
    await this.seed();
  }

  async seed(): Promise<void> {
    const count = await this.providerRepository.count();
    if (count > 0) {
      this.logger.log('SMS Providers already seeded. Skipping initial seed.');
      return;
    }

    this.logger.log('Seeding initial mock SMS providers (ROUTE_A, ROUTE_B, ROUTE_C)...');

    const defaultProviders = [
      {
        name: 'ROUTE_A',
        priority: 1, // Primary route
        balance: 1000,
        failureRate: 0.3, // 30% failure rate per brief
        isActive: true,
      },
      {
        name: 'ROUTE_B',
        priority: 2, // Secondary failover route
        balance: 1000,
        failureRate: 0.2, // 20% failure rate
        isActive: true,
      },
      {
        name: 'ROUTE_C',
        priority: 3, // Backup failover route
        balance: 1000,
        failureRate: 0.05, // 5% failure rate
        isActive: true,
      },
    ];

    await this.providerRepository.save(defaultProviders);
    this.logger.log('Mock SMS providers seeded successfully.');
  }
}
