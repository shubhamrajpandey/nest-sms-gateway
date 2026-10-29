import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SmsMessage,
  MessageStatus,
} from './entities/sms-message.entity.js';
import {
  ProviderAttempt,
  AttemptStatus,
} from '../provider-attempts/entities/provider-attempts.entity.js';
import { ProvidersService } from '../providers/providers.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import { normalizeNepaliPhone } from '../../common/utils/phone.util.js';
import { calculateSmsSegments } from '../../common/utils/sms-counter.util.js';
import { SendSmsDto } from './dto/send-sms.dto.js';
import { SmsQueryDto } from './dto/sms-query.dto.js';

export interface SendSmsResponse {
  id: string;
  recipient: string;
  message: string;
  encoding: string;
  parts: number;
  cost: number;
  status: MessageStatus;
  providerUsed: string | null;
  isRefunded: boolean;
  createdAt: Date;
  attempts: {
    provider: string;
    status: AttemptStatus;
    latencyMs: number | null;
    response: string | null;
  }[];
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    @InjectRepository(SmsMessage)
    private readonly smsRepository: Repository<SmsMessage>,
    @InjectRepository(ProviderAttempt)
    private readonly attemptRepository: Repository<ProviderAttempt>,
    private readonly providersService: ProvidersService,
    private readonly walletService: WalletService,
  ) {}

  /**
   * Main SMS Dispatch Pipeline:
   * 1. Validates and normalizes Nepali recipient mobile number.
   * 2. Calculates SMS segmentation and credit cost (GSM-7 vs Unicode).
   * 3. Atomically deducts credits from wallet with row-level locking.
   * 4. Sequentially attempts delivery through providers ordered by priority (ROUTE_A -> ROUTE_B -> ROUTE_C).
   * 5. If all routes fail, automatically triggers an idempotent wallet refund.
   */
  async sendSms(
    userId: string,
    dto: SendSmsDto,
    forceOutcome?: { success: boolean; response?: string },
  ): Promise<SendSmsResponse> {
    // 1. Validate & normalize Nepali phone number (throws BadRequestException if invalid)
    const normalizedRecipient = normalizeNepaliPhone(dto.recipient);

    // 2. Calculate encoding, parts, and cost
    const segmentResult = calculateSmsSegments(dto.message);
    const cost = segmentResult.cost;

    // 3. Atomically deduct credits from user's wallet with pessimistic row locking
    // (Throws BadRequestException immediately if balance is insufficient)
    await this.walletService.deductCredits(
      userId,
      cost,
      undefined,
      `SMS dispatch reservation to ${normalizedRecipient} (${segmentResult.parts} part(s))`,
    );

    // 4. Create initial PENDING message record
    const messageRecord = this.smsRepository.create({
      userId,
      recipient: normalizedRecipient,
      message: dto.message,
      encoding: segmentResult.encoding,
      parts: segmentResult.parts,
      cost,
      status: MessageStatus.PENDING,
      providerUsed: null,
      isRefunded: false,
    });
    const savedMessage = await this.smsRepository.save(messageRecord);

    // 5. Failover Routing: Traverse active providers in ascending priority order
    const activeProviders = await this.providersService.getActiveProviders();
    const recordedAttempts: ProviderAttempt[] = [];
    let isDelivered = false;

    if (activeProviders.length === 0) {
      this.logger.error('No active SMS providers configured in system');
    }

    for (const provider of activeProviders) {
      this.logger.log(
        `Attempting SMS dispatch [Message: ${savedMessage.id}] via ${provider.name} (Priority ${provider.priority})`,
      );

      const result = await this.providersService.sendViaProvider(
        provider,
        normalizedRecipient,
        dto.message,
        forceOutcome,
      );

      // Record this attempt in the database
      const attempt = await this.providersService.recordAttempt(
        savedMessage.id,
        provider,
        result.success ? AttemptStatus.SUCCESS : AttemptStatus.FAILED,
        result.latencyMs,
        result.response,
      );
      recordedAttempts.push(attempt);

      if (result.success) {
        // Successful transmission! Mark as SENT and stop failover cascade
        savedMessage.status = MessageStatus.SENT;
        savedMessage.providerUsed = provider.name;
        isDelivered = true;
        this.logger.log(
          `SMS successfully delivered [Message: ${savedMessage.id}] via ${provider.name}`,
        );
        break;
      }

      // If failed, loop continues to the next priority provider (failover)
      this.logger.warn(
        `Route ${provider.name} failed for message ${savedMessage.id}. Falling over to next route...`,
      );
    }

    // 6. Handle Total Failure & Automatic Idempotent Refund
    if (!isDelivered) {
      this.logger.error(
        `All routes failed for message ${savedMessage.id}. Triggering automatic refund...`,
      );
      savedMessage.status = MessageStatus.FAILED;

      // Refund the deducted credits back to user's wallet idempotently
      await this.walletService.refundCredits(
        userId,
        cost,
        savedMessage.id,
        `Automatic refund for failed SMS delivery (Message ID: ${savedMessage.id})`,
      );
      savedMessage.isRefunded = true;
    }

    await this.smsRepository.save(savedMessage);

    return {
      id: savedMessage.id,
      recipient: savedMessage.recipient,
      message: savedMessage.message,
      encoding: savedMessage.encoding,
      parts: savedMessage.parts,
      cost: savedMessage.cost,
      status: savedMessage.status,
      providerUsed: savedMessage.providerUsed,
      isRefunded: savedMessage.isRefunded,
      createdAt: savedMessage.createdAt,
      attempts: recordedAttempts.map((att) => ({
        provider: att.providerName,
        status: att.status,
        latencyMs: att.latencyMs,
        response: att.response,
      })),
    };
  }

  /**
   * Retrieves paginated SMS delivery history for a user.
   */
  async getSmsLogs(
    userId: string,
    query: SmsQueryDto,
  ): Promise<{ messages: SmsMessage[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(100, query.limit || 20));
    const skip = (page - 1) * limit;

    const whereClause: any = { userId };
    if (query.status) {
      whereClause.status = query.status;
    }

    const [messages, total] = await this.smsRepository.findAndCount({
      where: whereClause,
      relations: { attempts: true },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      messages,
      total,
      page,
      limit,
    };
  }

  /**
   * Retrieves details and delivery attempts of a single SMS by ID.
   */
  async getSmsById(userId: string, id: string): Promise<SmsMessage> {
    const message = await this.smsRepository.findOne({
      where: { id, userId },
      relations: { attempts: true },
    });

    if (!message) {
      throw new NotFoundException(`SMS Message with ID '${id}' not found`);
    }

    return message;
  }
}
