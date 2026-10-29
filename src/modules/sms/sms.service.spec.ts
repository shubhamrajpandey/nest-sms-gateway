import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SmsService } from './sms.service.js';
import { MessageStatus, SmsEncoding } from './entities/sms-message.entity.js';
import { AttemptStatus } from '../provider-attempts/entities/provider-attempts.entity.js';

describe('SmsService (Phase 5 - Failover & Dispatch)', () => {
  let service: SmsService;
  let mockSmsRepo: any;
  let mockAttemptRepo: any;
  let mockProvidersService: any;
  let mockWalletService: any;

  const mockUser = { id: 'u-123' };
  const mockProviders = [
    { id: 'p-1', name: 'ROUTE_A', priority: 1, balance: 1000, failureRate: 0.3, isActive: true },
    { id: 'p-2', name: 'ROUTE_B', priority: 2, balance: 1000, failureRate: 0.2, isActive: true },
    { id: 'p-3', name: 'ROUTE_C', priority: 3, balance: 1000, failureRate: 0.05, isActive: true },
  ];

  beforeEach(() => {
    mockSmsRepo = {
      create: vi.fn((data) => ({
        ...data,
        id: 'msg-uuid-1',
        createdAt: new Date(),
      })),
      save: vi.fn((entity) => Promise.resolve(entity)),
      findOne: vi.fn(),
      findAndCount: vi.fn(),
    };

    mockAttemptRepo = {
      create: vi.fn(),
      save: vi.fn(),
    };

    mockProvidersService = {
      getActiveProviders: vi.fn().mockResolvedValue(mockProviders),
      sendViaProvider: vi.fn(),
      recordAttempt: vi.fn((messageId, provider, status, latencyMs, response) =>
        Promise.resolve({
          id: 'att-1',
          messageId,
          providerId: provider.id,
          providerName: provider.name,
          status,
          latencyMs,
          response,
        }),
      ),
    };

    mockWalletService = {
      deductCredits: vi.fn().mockResolvedValue({ balance: 49.0 }),
      refundCredits: vi.fn().mockResolvedValue({ balance: 50.0 }),
    };

    service = new SmsService(
      mockSmsRepo,
      mockAttemptRepo,
      mockProvidersService,
      mockWalletService,
    );
  });

  describe('Validation & Upfront Deductions', () => {
    it('should reject invalid Nepali phone number before touching the wallet', async () => {
      await expect(
        service.sendSms(mockUser.id, {
          recipient: '1234567890',
          message: 'Hello!',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockWalletService.deductCredits).not.toHaveBeenCalled();
      expect(mockSmsRepo.save).not.toHaveBeenCalled();
    });

    it('should normalize +977 prefix and deduct 1 credit for standard GSM-7 message', async () => {
      mockProvidersService.sendViaProvider.mockResolvedValueOnce({
        success: true,
        latencyMs: 65,
        response: 'Delivered',
      });

      const response = await service.sendSms(mockUser.id, {
        recipient: '+9779841234567',
        message: 'Hello Nepal!',
      });

      expect(response.recipient).toBe('9841234567');
      expect(response.parts).toBe(1);
      expect(response.cost).toBe(1.0);
      expect(response.encoding).toBe(SmsEncoding.GSM_7);
      expect(mockWalletService.deductCredits).toHaveBeenCalledWith(
        mockUser.id,
        1.0,
        undefined,
        expect.any(String),
      );
      expect(response.status).toBe(MessageStatus.SENT);
      expect(response.providerUsed).toBe('ROUTE_A');
    });

    it('should deduct 2 credits for 100-character Nepali Unicode message', async () => {
      mockProvidersService.sendViaProvider.mockResolvedValueOnce({
        success: true,
        latencyMs: 70,
        response: 'Delivered',
      });

      const nepaliMsg = 'क'.repeat(100);
      const response = await service.sendSms(mockUser.id, {
        recipient: '9801122334',
        message: nepaliMsg,
      });

      expect(response.parts).toBe(2);
      expect(response.cost).toBe(2.0);
      expect(response.encoding).toBe(SmsEncoding.UNICODE);
      expect(mockWalletService.deductCredits).toHaveBeenCalledWith(
        mockUser.id,
        2.0,
        undefined,
        expect.any(String),
      );
    });

    it('should halt immediately if wallet has insufficient credits', async () => {
      mockWalletService.deductCredits.mockRejectedValueOnce(
        new BadRequestException('Insufficient wallet balance'),
      );

      await expect(
        service.sendSms(mockUser.id, {
          recipient: '9841234567',
          message: 'Test message',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockSmsRepo.save).not.toHaveBeenCalled();
      expect(mockProvidersService.getActiveProviders).not.toHaveBeenCalled();
    });
  });

  describe('Failover Cascade & Provider Routing', () => {
    it('should deliver via ROUTE_A on primary success without calling ROUTE_B or ROUTE_C', async () => {
      mockProvidersService.sendViaProvider.mockResolvedValueOnce({
        success: true,
        latencyMs: 55,
        response: 'Delivered via ROUTE_A',
      });

      const result = await service.sendSms(mockUser.id, {
        recipient: '9841112233',
        message: 'Primary route test',
      });

      expect(mockProvidersService.sendViaProvider).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(MessageStatus.SENT);
      expect(result.providerUsed).toBe('ROUTE_A');
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0].provider).toBe('ROUTE_A');
      expect(result.attempts[0].status).toBe(AttemptStatus.SUCCESS);
      expect(result.isRefunded).toBe(false);
    });

    it('should failover to ROUTE_B when ROUTE_A fails', async () => {
      // ROUTE_A fails, ROUTE_B succeeds
      mockProvidersService.sendViaProvider
        .mockResolvedValueOnce({
          success: false,
          latencyMs: 120,
          response: 'Timeout on ROUTE_A',
        })
        .mockResolvedValueOnce({
          success: true,
          latencyMs: 60,
          response: 'Delivered via ROUTE_B',
        });

      const result = await service.sendSms(mockUser.id, {
        recipient: '9841112233',
        message: 'Failover test',
      });

      expect(mockProvidersService.sendViaProvider).toHaveBeenCalledTimes(2);
      expect(result.status).toBe(MessageStatus.SENT);
      expect(result.providerUsed).toBe('ROUTE_B');
      expect(result.attempts).toHaveLength(2);
      expect(result.attempts[0].provider).toBe('ROUTE_A');
      expect(result.attempts[0].status).toBe(AttemptStatus.FAILED);
      expect(result.attempts[1].provider).toBe('ROUTE_B');
      expect(result.attempts[1].status).toBe(AttemptStatus.SUCCESS);
      expect(mockWalletService.refundCredits).not.toHaveBeenCalled();
    });

    it('should failover to ROUTE_C when both ROUTE_A and ROUTE_B fail', async () => {
      // ROUTE_A and ROUTE_B fail, ROUTE_C succeeds
      mockProvidersService.sendViaProvider
        .mockResolvedValueOnce({ success: false, latencyMs: 100, response: 'Error A' })
        .mockResolvedValueOnce({ success: false, latencyMs: 100, response: 'Error B' })
        .mockResolvedValueOnce({ success: true, latencyMs: 45, response: 'Success C' });

      const result = await service.sendSms(mockUser.id, {
        recipient: '9841112233',
        message: 'Tertiary route test',
      });

      expect(mockProvidersService.sendViaProvider).toHaveBeenCalledTimes(3);
      expect(result.status).toBe(MessageStatus.SENT);
      expect(result.providerUsed).toBe('ROUTE_C');
      expect(result.attempts).toHaveLength(3);
    });
  });

  describe('Total Failure & Automatic Refund', () => {
    it('should refund user wallet atomically when all 3 routes fail', async () => {
      // All 3 routes fail
      mockProvidersService.sendViaProvider
        .mockResolvedValueOnce({ success: false, latencyMs: 100, response: 'Error A' })
        .mockResolvedValueOnce({ success: false, latencyMs: 100, response: 'Error B' })
        .mockResolvedValueOnce({ success: false, latencyMs: 100, response: 'Error C' });

      const result = await service.sendSms(mockUser.id, {
        recipient: '9841112233',
        message: 'Total failure test',
      });

      expect(mockProvidersService.sendViaProvider).toHaveBeenCalledTimes(3);
      expect(result.status).toBe(MessageStatus.FAILED);
      expect(result.providerUsed).toBeNull();
      expect(result.isRefunded).toBe(true);

      // Verify automatic refund was triggered for the exact cost with message ID reference
      expect(mockWalletService.refundCredits).toHaveBeenCalledWith(
        mockUser.id,
        1.0,
        'msg-uuid-1',
        expect.stringContaining('msg-uuid-1'),
      );
    });
  });

  describe('Querying Logs & Message By ID', () => {
    it('should get single message with attempts', async () => {
      mockSmsRepo.findOne.mockResolvedValue({
        id: 'msg-1',
        userId: mockUser.id,
        recipient: '9841234567',
        status: MessageStatus.SENT,
        attempts: [],
      });

      const message = await service.getSmsById(mockUser.id, 'msg-1');
      expect(message.id).toBe('msg-1');
    });

    it('should throw NotFoundException if message belongs to another user or does not exist', async () => {
      mockSmsRepo.findOne.mockResolvedValue(null);

      await expect(service.getSmsById(mockUser.id, 'msg-nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

