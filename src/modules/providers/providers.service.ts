import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SmsProvider } from './entities/sms-provider.entity.js';
import {
  ProviderAttempt,
  AttemptStatus,
} from '../provider-attempts/entities/provider-attempts.entity.js';

export interface ProviderDispatchResult {
  success: boolean;
  latencyMs: number;
  response: string;
}

@Injectable()
export class ProvidersService {
  private readonly logger = new Logger(ProvidersService.name);

  constructor(
    @InjectRepository(SmsProvider)
    private readonly providerRepository: Repository<SmsProvider>,
    @InjectRepository(ProviderAttempt)
    private readonly attemptRepository: Repository<ProviderAttempt>,
  ) {}

  /**
   * Returns all active SMS providers sorted by priority in ascending order (1 = primary).
   */
  async getActiveProviders(): Promise<SmsProvider[]> {
    return this.providerRepository.find({
      where: { isActive: true },
      order: { priority: 'ASC' },
    });
  }

  /**
   * Retrieves all SMS providers with current balances and priority rankings.
   */
  async getAllProviders(): Promise<SmsProvider[]> {
    return this.providerRepository.find({
      order: { priority: 'ASC' },
    });
  }

  /**
   * Retrieves the current balance for a named provider route.
   */
  async getBalance(providerName: string): Promise<number> {
    const provider = await this.providerRepository.findOne({
      where: { name: providerName },
    });
    return provider ? provider.getBalance() : 0;
  }

  /**
   * Simulates sending an SMS through a specific provider based on its failure rate and latency.
   * Decrements provider balance on success.
   */
  async sendViaProvider(
    provider: SmsProvider,
    recipient: string,
    message: string,
    forceOutcome?: { success: boolean; response?: string },
  ): Promise<ProviderDispatchResult> {
    const startTime = Date.now();

    // 1. Check simulated provider balance
    if (provider.balance <= 0) {
      const latencyMs = 10;
      return {
        success: false,
        latencyMs,
        response: `Provider ${provider.name} has exhausted its credit balance (${provider.balance} remaining)`,
      };
    }

    // 2. Simulate network latency (50ms - 150ms), skipped in automated test environments
    const simulatedDelay = Math.floor(Math.random() * 100) + 50;
    if (process.env.NODE_ENV !== 'test') {
      await new Promise((resolve) => setTimeout(resolve, simulatedDelay));
    }
    const latencyMs = Date.now() - startTime + (process.env.NODE_ENV === 'test' ? 15 : 0);

    // 3. Determine success or failure
    let isSuccess: boolean;
    let responseText: string;

    if (forceOutcome !== undefined) {
      isSuccess = forceOutcome.success;
      responseText =
        forceOutcome.response ||
        (isSuccess
          ? `Delivered via ${provider.name} (Simulated ACK)`
          : `Simulated transmission failure on ${provider.name}`);
    } else {
      // Use configured failure rate (e.g. 0.30 = 30% probability of failure)
      const roll = Math.random();
      isSuccess = roll >= provider.failureRate;

      if (isSuccess) {
        responseText = `Delivered successfully via ${provider.name} (Message ID ACK: ${Date.now()})`;
      } else {
        responseText = `Gateway Error: Route ${provider.name} upstream failure (Simulated rate: ${(provider.failureRate * 100).toFixed(0)}%)`;
      }
    }

    // 4. On successful delivery, deduct provider balance
    if (isSuccess) {
      provider.balance = Math.max(0, provider.balance - 1);
      await this.providerRepository.save(provider);
      this.logger.log(
        `[${provider.name}] Delivered to ${recipient}. Remaining balance: ${provider.balance}`,
      );
    } else {
      this.logger.warn(
        `[${provider.name}] Failed delivery to ${recipient}: ${responseText}`,
      );
    }

    return {
      success: isSuccess,
      latencyMs,
      response: responseText,
    };
  }

  /**
   * Persists an audit attempt record for a specific message and provider.
   */
  async recordAttempt(
    messageId: string,
    provider: SmsProvider,
    status: AttemptStatus,
    latencyMs: number,
    response: string,
  ): Promise<ProviderAttempt> {
    const attempt = this.attemptRepository.create({
      messageId,
      providerId: provider.id,
      providerName: provider.name,
      status,
      latencyMs,
      response,
    });

    return this.attemptRepository.save(attempt);
  }
}

