import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SmsProvider } from '../providers/entities/sms-provider.entity.js';
import {
  ProviderAttempt,
  AttemptStatus,
} from '../provider-attempts/entities/provider-attempts.entity.js';

export type RouteHealthStatus = 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'IDLE';

export interface RouteHealthMetric {
  providerId: string;
  providerName: string;
  priority: number;
  isActive: boolean;
  balance: number; // Provider's current balance
  successRate: number; // 24-hour success rate %
  healthPercentage: number; // Calculated composite Health %
  status: RouteHealthStatus;
  configuredFailureRate: number;
  metrics: {
    totalAttempts: number;
    successfulAttempts: number;
    failedAttempts: number;
    successRate: number;
    actualFailureRate: number;
    averageLatencyMs: number;
    minLatencyMs: number;
    maxLatencyMs: number;
  };
}

export interface RoutesHealthReport {
  windowHours: number;
  windowStart: Date;
  generatedAt: Date;
  summary: {
    totalRoutes: number;
    activeRoutes: number;
    totalAttempts: number;
    successfulAttempts: number;
    failedAttempts: number;
    overallSuccessRate: number;
  };
  routes: RouteHealthMetric[];
}

@Injectable()
export class RoutesHealthService {
  private readonly logger = new Logger(RoutesHealthService.name);

  constructor(
    @InjectRepository(SmsProvider)
    private readonly providerRepository: Repository<SmsProvider>,
    @InjectRepository(ProviderAttempt)
    private readonly attemptRepository: Repository<ProviderAttempt>,
  ) {}

  /**
   * Aggregates attempt history over the specified time window (default: 24 hours)
   * to compute operational health, delivery success rates, latency analytics, and health %.
   *
   * Health % Formula:
   *   Health % = (SuccessRate% * 0.70) + (LatencyScore% * 0.20) + (BalanceScore% * 0.10)
   */
  async getRoutesHealth(hours: number = 24): Promise<RoutesHealthReport> {
    const safeHours = Math.max(1, hours);
    const windowStart = new Date(Date.now() - safeHours * 60 * 60 * 1000);
    const generatedAt = new Date();

    // 1. Fetch all configured providers ordered by priority
    const providers = await this.providerRepository.find({
      order: { priority: 'ASC' },
    });

    // 2. Aggregate attempt metrics over the time window grouped by provider name
    // Leveraging the indexed createdAt column on provider_attempts
    const rawStats = await this.attemptRepository
      .createQueryBuilder('attempt')
      .select('attempt.providerName', 'providerName')
      .addSelect('COUNT(*)', 'totalAttempts')
      .addSelect(
        `COUNT(CASE WHEN attempt.status = '${AttemptStatus.SUCCESS}' THEN 1 END)`,
        'successfulAttempts',
      )
      .addSelect(
        `COUNT(CASE WHEN attempt.status = '${AttemptStatus.FAILED}' THEN 1 END)`,
        'failedAttempts',
      )
      .addSelect('COALESCE(ROUND(AVG(attempt.latencyMs)), 0)', 'averageLatencyMs')
      .addSelect('COALESCE(MIN(attempt.latencyMs), 0)', 'minLatencyMs')
      .addSelect('COALESCE(MAX(attempt.latencyMs), 0)', 'maxLatencyMs')
      .where('attempt.createdAt >= :windowStart', { windowStart })
      .groupBy('attempt.providerName')
      .getRawMany();

    const statsMap = new Map<string, any>();
    for (const stat of rawStats) {
      statsMap.set(stat.providerName, stat);
    }

    // 3. Combine provider configurations with aggregated metrics
    let totalAttempts = 0;
    let totalSuccessful = 0;
    let totalFailed = 0;
    let activeRoutesCount = 0;

    const routes: RouteHealthMetric[] = providers.map((provider) => {
      if (provider.isActive) {
        activeRoutesCount++;
      }

      const stat = statsMap.get(provider.name);
      const attemptsCount = stat ? Number(stat.totalAttempts) : 0;
      const successCount = stat ? Number(stat.successfulAttempts) : 0;
      const failCount = stat ? Number(stat.failedAttempts) : 0;
      const avgLatency = stat ? Math.round(Number(stat.averageLatencyMs)) : 0;
      const minLatency = stat ? Math.round(Number(stat.minLatencyMs)) : 0;
      const maxLatency = stat ? Math.round(Number(stat.maxLatencyMs)) : 0;

      totalAttempts += attemptsCount;
      totalSuccessful += successCount;
      totalFailed += failCount;

      const successRate =
        attemptsCount > 0 ? Number(((successCount / attemptsCount) * 100).toFixed(2)) : 0;
      const actualFailureRate =
        attemptsCount > 0 ? Number(((failCount / attemptsCount) * 100).toFixed(2)) : 0;

      // Determine operational health status
      let status: RouteHealthStatus;
      if (!provider.isActive || provider.balance <= 0) {
        status = 'DOWN';
      } else if (attemptsCount === 0) {
        status = 'IDLE';
      } else if (actualFailureRate > 50) {
        status = 'DEGRADED';
      } else {
        status = 'HEALTHY';
      }

      // Calculate Composite Health %:
      // Weight 1: Success Rate (70%)
      // Weight 2: Latency Score (20% - 100 points for <=100ms, scaling down)
      // Weight 3: Balance Availability (10% - 100 points if balance >= 100)
      let healthPercentage: number;
      if (!provider.isActive || provider.balance <= 0) {
        healthPercentage = 0.0;
      } else if (attemptsCount === 0) {
        // Idle baseline health based on configured expected reliability
        const expectedSuccessRate = (1.0 - provider.failureRate) * 100;
        healthPercentage = Number((expectedSuccessRate * 0.70 + 20.0 + 10.0).toFixed(2));
      } else {
        const latencyScore = Math.max(0, 100 - Math.max(0, (avgLatency - 100) / 9));
        const balanceScore = Math.min(100, (provider.balance / 100) * 100);
        healthPercentage = Number(
          (successRate * 0.70 + latencyScore * 0.20 + balanceScore * 0.10).toFixed(2),
        );
      }

      return {
        providerId: provider.id,
        providerName: provider.name,
        priority: provider.priority,
        isActive: provider.isActive,
        balance: provider.balance,
        successRate,
        healthPercentage,
        status,
        configuredFailureRate: Number(provider.failureRate),
        metrics: {
          totalAttempts: attemptsCount,
          successfulAttempts: successCount,
          failedAttempts: failCount,
          successRate,
          actualFailureRate,
          averageLatencyMs: avgLatency,
          minLatencyMs: minLatency,
          maxLatencyMs: maxLatency,
        },
      };
    });

    const overallSuccessRate =
      totalAttempts > 0 ? Number(((totalSuccessful / totalAttempts) * 100).toFixed(2)) : 0;

    return {
      windowHours: safeHours,
      windowStart,
      generatedAt,
      summary: {
        totalRoutes: providers.length,
        activeRoutes: activeRoutesCount,
        totalAttempts,
        successfulAttempts: totalSuccessful,
        failedAttempts: totalFailed,
        overallSuccessRate,
      },
      routes,
    };
  }
}
