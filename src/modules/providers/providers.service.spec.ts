import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProvidersService } from './providers.service.js';
import { AttemptStatus } from '../provider-attempts/entities/provider-attempts.entity.js';

describe('ProvidersService', () => {
  let service: ProvidersService;
  let mockProviderRepo: any;
  let mockAttemptRepo: any;

  beforeEach(() => {
    mockProviderRepo = {
      find: vi.fn(),
      save: vi.fn((entity) => Promise.resolve(entity)),
    };

    mockAttemptRepo = {
      create: vi.fn((data) => ({ ...data, id: 'att-123' })),
      save: vi.fn((entity) => Promise.resolve(entity)),
    };

    service = new ProvidersService(mockProviderRepo, mockAttemptRepo);
  });

  describe('getActiveProviders', () => {
    it('should query active providers ordered by priority ASC', async () => {
      mockProviderRepo.find.mockResolvedValue([
        { id: '1', name: 'ROUTE_A', priority: 1, isActive: true },
        { id: '2', name: 'ROUTE_B', priority: 2, isActive: true },
      ]);

      const providers = await service.getActiveProviders();
      expect(providers).toHaveLength(2);
      expect(mockProviderRepo.find).toHaveBeenCalledWith({
        where: { isActive: true },
        order: { priority: 'ASC' },
      });
    });
  });

  describe('sendViaProvider', () => {
    it('should fail immediately if provider has 0 balance', async () => {
      const provider = {
        id: '1',
        name: 'ROUTE_A',
        priority: 1,
        balance: 0,
        failureRate: 0.3,
        isActive: true,
      };

      const result = await service.sendViaProvider(provider as any, '9841234567', 'Hello');
      expect(result.success).toBe(false);
      expect(result.response).toContain('exhausted its credit balance');
      expect(mockProviderRepo.save).not.toHaveBeenCalled();
    });

    it('should decrement provider balance on success', async () => {
      const provider = {
        id: '1',
        name: 'ROUTE_A',
        priority: 1,
        balance: 100,
        failureRate: 0.3,
        isActive: true,
      };

      const result = await service.sendViaProvider(
        provider as any,
        '9841234567',
        'Hello',
        { success: true },
      );

      expect(result.success).toBe(true);
      expect(provider.balance).toBe(99);
      expect(mockProviderRepo.save).toHaveBeenCalledWith(provider);
    });

    it('should not decrement provider balance on failure', async () => {
      const provider = {
        id: '1',
        name: 'ROUTE_A',
        priority: 1,
        balance: 100,
        failureRate: 0.3,
        isActive: true,
      };

      const result = await service.sendViaProvider(
        provider as any,
        '9841234567',
        'Hello',
        { success: false, response: 'Upstream gateway error' },
      );

      expect(result.success).toBe(false);
      expect(provider.balance).toBe(100);
      expect(mockProviderRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('recordAttempt', () => {
    it('should persist attempt in attemptRepository', async () => {
      const provider = { id: 'p-1', name: 'ROUTE_A' };

      const attempt = await service.recordAttempt(
        'msg-1',
        provider as any,
        AttemptStatus.SUCCESS,
        85,
        'Delivered ACK',
      );

      expect(mockAttemptRepo.create).toHaveBeenCalledWith({
        messageId: 'msg-1',
        providerId: 'p-1',
        providerName: 'ROUTE_A',
        status: AttemptStatus.SUCCESS,
        latencyMs: 85,
        response: 'Delivered ACK',
      });
      expect(mockAttemptRepo.save).toHaveBeenCalled();
      expect(attempt.status).toBe(AttemptStatus.SUCCESS);
    });
  });
});

