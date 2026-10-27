import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity.js';
import { Wallet } from '../wallet/entities/wallet.entity.js';
import {
  WalletTransaction,
  TransactionType,
} from '../wallet/entities/wallet-transaction.entity.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();

    // 1. Check if user already exists
    const existingUser = await this.dataSource.getRepository(User).findOne({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    // 2. Hash raw password securely with bcrypt (10 salt rounds)
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    // 3. Atomically create User + Wallet + Initial Transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Save User
      const user = queryRunner.manager.create(User, {
        email,
        password: passwordHash,
      });
      const savedUser = await queryRunner.manager.save(user);

      // Create starting wallet with 50 credits
      const initialCredits = 50.0;
      const wallet = queryRunner.manager.create(Wallet, {
        userId: savedUser.id,
        balance: initialCredits,
      });
      const savedWallet = await queryRunner.manager.save(wallet);

      // Record initial credit in transaction audit ledger
      const transaction = queryRunner.manager.create(WalletTransaction, {
        walletId: savedWallet.id,
        amount: initialCredits,
        balanceAfter: initialCredits,
        type: TransactionType.INITIAL,
        description: 'Welcome bonus starting credits',
      });
      await queryRunner.manager.save(transaction);

      // Commit the transaction
      await queryRunner.commitTransaction();

      // 4. Generate JWT access token
      const accessToken = this.generateToken(savedUser);

      return {
        message: 'User registered successfully',
        accessToken,
        user: {
          id: savedUser.id,
          email: savedUser.email,
          balance: initialCredits,
        },
      };
    } catch (error) {
      // If anything fails, roll back completely so no orphan user or wallet is left
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async login(dto: LoginDto) {
    const email = dto.email.toLowerCase().trim();

    // 1. Query user (must explicitly select password since select: false)
    const user = await this.dataSource
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.password')
      .leftJoinAndSelect('user.wallet', 'wallet')
      .where('user.email = :email', { email })
      .getOne();

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // 2. Compare plain password with the stored bcrypt hash
    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // 3. Generate token
    const accessToken = this.generateToken(user);

    return {
      message: 'Login successful',
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        balance: user.wallet ? user.wallet.balance : 0,
      },
    };
  }

  private generateToken(user: User): string {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
    });
  }
}