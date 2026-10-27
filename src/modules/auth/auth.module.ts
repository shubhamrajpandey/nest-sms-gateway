import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { User } from '../users/entities/user.entity.js';
import { Wallet } from '../wallet/entities/wallet.entity.js';
import { WalletTransaction } from '../wallet/entities/wallet-transaction.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Wallet, WalletTransaction]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>(
          'JWT_SECRET',
          'nest_sms_gateway_secure_jwt_secret_key_2026',
        ),
        signOptions: {
          expiresIn: (config.get<string>('JWT_EXPIRATION', '1d') as any),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtStrategy, PassportModule, JwtModule],
})
export class AuthModule {}
