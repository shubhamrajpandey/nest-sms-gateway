import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WalletService } from './wallet.service.js';
import { TransactionType } from './entities/wallet-transaction.entity.js';

describe('WalletService', () => {
  let service: WalletService;
  let mockWalletRepo: any;
  let mockTransactionRepo: any;
  let mockQueryRunner: any;
  let mockDataSource: any;

  beforeEach(() => {
    mockWalletRepo = {
      findOne: vi.fn(),
      save: vi.fn(),
    };

    mockTransactionRepo = {
      findAndCount: vi.fn(),
      findOne: vi.fn(),
    };

    mockQueryRunner = {
      connect: vi.fn(),
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      rollbackTransaction: vi.fn(),
      release: vi.fn(),
      manager: {
        findOne: vi.fn(),
        save: vi.fn((entity) => Promise.resolve(entity)),
        create: vi.fn((_, dto) => ({ ...dto, id: 'tx-123', createdAt: new Date() })),
      },
    };

    mockDataSource = {
      createQueryRunner: vi.fn(() => mockQueryRunner),
    };

    service = new WalletService(mockWalletRepo, mockTransactionRepo, mockDataSource);
  });

  describe('getBalance', () => {
    it('should return balance for an existing user wallet', async () => {
      mockWalletRepo.findOne.mockResolvedValue({
        id: 'w-1',
        userId: 'u-1',
        balance: 50.0,
      });

      const result = await service.getBalance('u-1');
      expect(result.balance).toBe(50.0);
      expect(mockWalletRepo.findOne).toHaveBeenCalledWith({ where: { userId: 'u-1' } });
    });

    it('should throw NotFoundException if wallet does not exist', async () => {
      mockWalletRepo.findOne.mockResolvedValue(null);

      await expect(service.getBalance('u-unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deductCredits', () => {
    it('should deduct credits atomically with row lock when balance is sufficient', async () => {
      const initialWallet = { id: 'w-1', userId: 'u-1', balance: 50.0 };
      mockQueryRunner.manager.findOne.mockResolvedValue(initialWallet);

      const result = await service.deductCredits('u-1', 10.0, 'msg-1', 'SMS send');

      expect(mockQueryRunner.manager.findOne).toHaveBeenCalledWith(expect.anything(), {
        where: { userId: 'u-1' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(result.balance).toBe(40.0);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should throw BadRequestException and rollback when balance is insufficient', async () => {
      const lowBalanceWallet = { id: 'w-1', userId: 'u-1', balance: 5.0 };
      mockQueryRunner.manager.findOne.mockResolvedValue(lowBalanceWallet);

      await expect(
        service.deductCredits('u-1', 10.0, 'msg-1', 'SMS send'),
      ).rejects.toThrow(BadRequestException);

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });

  describe('refundCredits', () => {
    it('should refund credits and record transaction if not previously refunded', async () => {
      // No prior refund
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce(null) // existing refund query
        .mockResolvedValueOnce({ id: 'w-1', userId: 'u-1', balance: 40.0 }); // wallet lock query

      const result = await service.refundCredits('u-1', 10.0, 'msg-failed');

      expect(result.balance).toBe(50.0);
      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(expect.anything(), {
        walletId: 'w-1',
        amount: 10.0,
        balanceAfter: 50.0,
        type: TransactionType.REFUND,
        referenceId: 'msg-failed',
        description: expect.stringContaining('msg-failed'),
      });
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should be idempotent: do not refund twice for the same referenceId', async () => {
      const existingRefundTx = {
        id: 'tx-refund-old',
        walletId: 'w-1',
        amount: 10.0,
        balanceAfter: 50.0,
        type: TransactionType.REFUND,
        referenceId: 'msg-failed',
      };

      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce(existingRefundTx) // already refunded!
        .mockResolvedValueOnce({ id: 'w-1', balance: 50.0 });

      const result = await service.refundCredits('u-1', 10.0, 'msg-failed');

      expect(result.transaction.id).toBe('tx-refund-old');
      // Should NOT have created another transaction or called manager.save
      expect(mockQueryRunner.manager.create).not.toHaveBeenCalled();
    });
  });

  describe('topUp', () => {
    it('should add credits and record TOPUP transaction', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue({
        id: 'w-1',
        userId: 'u-1',
        balance: 10.0,
      });

      const result = await service.topUp('u-1', 100.0);

      expect(result.balance).toBe(110.0);
      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(expect.anything(), {
        walletId: 'w-1',
        amount: 100.0,
        balanceAfter: 110.0,
        type: TransactionType.TOPUP,
        description: 'Wallet top-up',
      });
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });
  });
});

