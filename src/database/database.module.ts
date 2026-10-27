import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { SmsProvider } from '../modules/providers/entities/sms-provider.entity.js';
import { ProviderSeed } from './seeds/provider.seed.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USER', 'postgres'),
        password: config.get<string>('DB_PASSWORD', 'password'),
        database: config.get<string>('DB_NAME', 'sms_gateway'),
        autoLoadEntities: true,
        synchronize: config.get<string>('NODE_ENV') === 'development',
      }),
    }),
    TypeOrmModule.forFeature([SmsProvider]),
  ],
  providers: [ProviderSeed],
  exports: [TypeOrmModule,ProviderSeed],
})
export class DatabaseModule {}
