import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner } from 'typeorm';
import { Wallet } from './entities/wallet.entity.js';
import {
  WalletTransaction,
  TransactionType,
} from './entities/wallet-transaction.entity.js';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(WalletTransaction)
    private readonly transactionRepository: Repository<WalletTransaction>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Retrieves the wallet associated with a user ID.
   */
  async getWalletByUserId(userId: string): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({
      where: { userId },
    });

    if (!wallet) {
      throw new NotFoundException(`Wallet not found for user ${userId}`);
    }

    return wallet;
  }

  /**
   * Retrieves the current balance for a user.
   */
  async getBalance(userId: string): Promise<{ balance: number }> {
    const wallet = await this.getWalletByUserId(userId);
    return { balance: Number(wallet.balance) };
  }

  /**
   * Tops up a user's wallet atomically with a pessimistic lock.
   */
  async topUp(
    userId: string,
    amount: number,
    description: string = 'Wallet top-up',
  ): Promise<{ message: string; balance: number; transaction: WalletTransaction }> {
    if (amount <= 0) {
      throw new BadRequestException('Top-up amount must be greater than zero');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const wallet = await queryRunner.manager.findOne(Wallet, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException(`Wallet not found for user ${userId}`);
      }

      const currentBalance = Number(wallet.balance);
      const newBalance = Number((currentBalance + Number(amount)).toFixed(2));
      wallet.balance = newBalance;
      const savedWallet = await queryRunner.manager.save(wallet);

      const transaction = queryRunner.manager.create(WalletTransaction, {
        walletId: savedWallet.id,
        amount: Number(amount),
        balanceAfter: newBalance,
        type: TransactionType.TOPUP,
        description,
      });
      const savedTransaction = await queryRunner.manager.save(transaction);

      await queryRunner.commitTransaction();

      return {
        message: 'Top-up successful',
        balance: newBalance,
        transaction: savedTransaction,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Concurrency-safe atomic deduction of credits using PostgreSQL pessimistic row-level locking.
   * Prevents race conditions and double-spending across parallel SMS dispatches.
   */
  async deductCredits(
    userId: string,
    amount: number,
    referenceId?: string,
    description: string = 'SMS credit deduction',
    externalRunner?: QueryRunner,
  ): Promise<{ balance: number; transaction: WalletTransaction }> {
    if (amount <= 0) {
      throw new BadRequestException('Deduction amount must be greater than zero');
    }

    const runner = externalRunner || this.dataSource.createQueryRunner();
    const isLocalRunner = !externalRunner;

    if (isLocalRunner) {
      await runner.connect();
      await runner.startTransaction();
    }

    try {
      // Row-level lock: SELECT ... FOR UPDATE
      const wallet = await runner.manager.findOne(Wallet, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException(`Wallet not found for user ${userId}`);
      }

      const currentBalance = Number(wallet.balance);
      if (currentBalance < amount) {
        throw new BadRequestException(
          `Insufficient wallet balance. Required: ${amount}, Available: ${currentBalance}`,
        );
      }

      const newBalance = Number((currentBalance - Number(amount)).toFixed(2));
      wallet.balance = newBalance;
      const savedWallet = await runner.manager.save(wallet);

      const transaction = runner.manager.create(WalletTransaction, {
        walletId: savedWallet.id,
        amount: Number(amount),
        balanceAfter: newBalance,
        type: TransactionType.DEBIT,
        referenceId: referenceId ?? null,
        description,
      });
      const savedTransaction = await runner.manager.save(transaction);

      if (isLocalRunner) {
        await runner.commitTransaction();
      }

      return {
        balance: newBalance,
        transaction: savedTransaction,
      };
    } catch (error) {
      if (isLocalRunner) {
        await runner.rollbackTransaction();
      }
      throw error;
    } finally {
      if (isLocalRunner) {
        await runner.release();
      }
    }
  }

  /**
   * Idempotent refund when all SMS providers fail.
   * Guarantees an SMS message ID cannot be refunded multiple times.
   */
  async refundCredits(
    userId: string,
    amount: number,
    referenceId: string,
    description?: string,
    externalRunner?: QueryRunner,
  ): Promise<{ balance: number; transaction: WalletTransaction }> {
    if (amount <= 0) {
      throw new BadRequestException('Refund amount must be greater than zero');
    }

    const runner = externalRunner || this.dataSource.createQueryRunner();
    const isLocalRunner = !externalRunner;

    if (isLocalRunner) {
      await runner.connect();
      await runner.startTransaction();
    }

    try {
      // 1. Idempotency Check: Check if this SMS was already refunded
      const existingRefund = await runner.manager.findOne(WalletTransaction, {
        where: {
          referenceId,
          type: TransactionType.REFUND,
        },
      });

      if (existingRefund) {
        this.logger.warn(
          `Duplicate refund attempt detected for referenceId ${referenceId}. Skipping refund.`,
        );
        const wallet = await runner.manager.findOne(Wallet, {
          where: { id: existingRefund.walletId },
        });
        return {
          balance: Number(wallet ? wallet.balance : 0),
          transaction: existingRefund,
        };
      }

      // 2. Lock wallet row
      const wallet = await runner.manager.findOne(Wallet, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException(`Wallet not found for user ${userId}`);
      }

      const currentBalance = Number(wallet.balance);
      const newBalance = Number((currentBalance + Number(amount)).toFixed(2));
      wallet.balance = newBalance;
      const savedWallet = await runner.manager.save(wallet);

      const transaction = runner.manager.create(WalletTransaction, {
        walletId: savedWallet.id,
        amount: Number(amount),
        balanceAfter: newBalance,
        type: TransactionType.REFUND,
        referenceId,
        description: description || `Refund for failed delivery (Message ID: ${referenceId})`,
      });
      const savedTransaction = await runner.manager.save(transaction);

      if (isLocalRunner) {
        await runner.commitTransaction();
      }

      return {
        balance: newBalance,
        transaction: savedTransaction,
      };
    } catch (error) {
      if (isLocalRunner) {
        await runner.rollbackTransaction();
      }
      throw error;
    } finally {
      if (isLocalRunner) {
        await runner.release();
      }
    }
  }

  /**
   * Paginated audit history of wallet transactions for the user.
   */
  async getTransactions(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ transactions: WalletTransaction[]; total: number; page: number; limit: number }> {
    const wallet = await this.getWalletByUserId(userId);

    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, Math.min(100, limit));
    const skip = (safePage - 1) * safeLimit;

    const [transactions, total] = await this.transactionRepository.findAndCount({
      where: { walletId: wallet.id },
      order: { createdAt: 'DESC' },
      skip,
      take: safeLimit,
    });

    return {
      transactions,
      total,
      page: safePage,
      limit: safeLimit,
    };
  }
}
