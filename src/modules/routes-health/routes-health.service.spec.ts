import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RoutesHealthService } from './routes-health.service.js';

describe('RoutesHealthService (Phase 6 - Route Health & Analytics)', () => {
  let service: RoutesHealthService;
  let mockProviderRepo: any;
  let mockAttemptRepo: any;
  let mockQueryBuilder: any;

  const mockProviders = [
    {
      id: 'p-1',
      name: 'ROUTE_A',
      priority: 1,
      balance: 950,
      failureRate: 0.3,
      isActive: true,
    },
    {
      id: 'p-2',
      name: 'ROUTE_B',
      priority: 2,
      balance: 980,
      failureRate: 0.2,
      isActive: true,
    },
    {
      id: 'p-3',
      name: 'ROUTE_C',
      priority: 3,
      balance: 1000,
      failureRate: 0.05,
      isActive: true,
    },
    {
      id: 'p-4',
      name: 'ROUTE_DISABLED',
      priority: 4,
      balance: 500,
      failureRate: 0.1,
      isActive: false,
    },
  ];

  beforeEach(() => {
    mockQueryBuilder = {
      select: vi.fn().mockReturnThis(),
      addSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      getRawMany: vi.fn(),
    };

    mockProviderRepo = {
      find: vi.fn().mockResolvedValue(mockProviders),
    };

    mockAttemptRepo = {
      createQueryBuilder: vi.fn(() => mockQueryBuilder),
    };

    service = new RoutesHealthService(mockProviderRepo, mockAttemptRepo);
  });

  it('should calculate 24h health metrics, success rates, and latency for active routes', async () => {
    mockQueryBuilder.getRawMany.mockResolvedValue([
      {
        providerName: 'ROUTE_A',
        totalAttempts: '100',
        successfulAttempts: '70',
        failedAttempts: '30',
        averageLatencyMs: '75',
        minLatencyMs: '50',
        maxLatencyMs: '120',
      },
      {
        providerName: 'ROUTE_B',
        totalAttempts: '30',
        successfulAttempts: '24',
        failedAttempts: '6',
        averageLatencyMs: '80',
        minLatencyMs: '55',
        maxLatencyMs: '110',
      },
    ]);

    const report = await service.getRoutesHealth(24);

    expect(report.windowHours).toBe(24);
    expect(report.summary.totalRoutes).toBe(4);
    expect(report.summary.activeRoutes).toBe(3);
    expect(report.summary.totalAttempts).toBe(130);
    expect(report.summary.successfulAttempts).toBe(94);
    expect(report.summary.failedAttempts).toBe(36);
    expect(report.summary.overallSuccessRate).toBe(72.31); // 94 / 130 * 100

    // ROUTE_A metrics
    const routeA = report.routes.find((r) => r.providerName === 'ROUTE_A')!;
    expect(routeA.status).toBe('HEALTHY');
    expect(routeA.balance).toBe(950);
    expect(routeA.successRate).toBe(70.0);
    expect(routeA.healthPercentage).toBeGreaterThan(0);
    expect(routeA.metrics.totalAttempts).toBe(100);
    expect(routeA.metrics.successRate).toBe(70.0);
    expect(routeA.metrics.actualFailureRate).toBe(30.0);
    expect(routeA.metrics.averageLatencyMs).toBe(75);

    // ROUTE_C had 0 attempts -> should be IDLE
    const routeC = report.routes.find((r) => r.providerName === 'ROUTE_C')!;
    expect(routeC.status).toBe('IDLE');
    expect(routeC.metrics.totalAttempts).toBe(0);
    expect(routeC.metrics.successRate).toBe(0);

    // Inactive route -> should be DOWN
    const routeDisabled = report.routes.find((r) => r.providerName === 'ROUTE_DISABLED')!;
    expect(routeDisabled.status).toBe('DOWN');
  });

  it('should flag a route as DEGRADED if actual failure rate exceeds 50%', async () => {
    mockQueryBuilder.getRawMany.mockResolvedValue([
      {
        providerName: 'ROUTE_A',
        totalAttempts: '50',
        successfulAttempts: '15',
        failedAttempts: '35', // 70% failure rate
        averageLatencyMs: '190',
        minLatencyMs: '100',
        maxLatencyMs: '300',
      },
    ]);

    const report = await service.getRoutesHealth(24);
    const routeA = report.routes.find((r) => r.providerName === 'ROUTE_A')!;

    expect(routeA.status).toBe('DEGRADED');
    expect(routeA.metrics.actualFailureRate).toBe(70.0);
  });

  it('should flag a route as DOWN if its credit balance is 0', async () => {
    mockProviderRepo.find.mockResolvedValue([
      {
        id: 'p-exhausted',
        name: 'ROUTE_EXHAUSTED',
        priority: 1,
        balance: 0,
        failureRate: 0.1,
        isActive: true,
      },
    ]);
    mockQueryBuilder.getRawMany.mockResolvedValue([]);

    const report = await service.getRoutesHealth(24);
    const exhaustedRoute = report.routes[0];

    expect(exhaustedRoute.status).toBe('DOWN');
  });

  it('should support custom window hours', async () => {
    mockQueryBuilder.getRawMany.mockResolvedValue([]);

    const report = await service.getRoutesHealth(12);

    expect(report.windowHours).toBe(12);
    expect(mockQueryBuilder.where).toHaveBeenCalledWith(
      'attempt.createdAt >= :windowStart',
      expect.objectContaining({ windowStart: expect.any(Date) }),
    );
  });
});

