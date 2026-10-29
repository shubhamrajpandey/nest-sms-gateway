import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, Between } from 'typeorm';
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
  results?: SendSmsResponse[];
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
   * 1. Accepts single or multiple recipient numbers via `to: string[]` or `recipient: string`.
   * 2. Validates and normalizes all Nepali mobile numbers (rejects invalid ones clearly).
   * 3. Calculates SMS segmentation and credit cost (GSM-7 vs Unicode).
   * 4. Deducts total credits from wallet inside an atomic DB transaction with row-level locking.
   * 5. Sequentially dispatches to top-priority providers with available balance.
   * 6. Automatically refunds credits if all routes fail for any recipient.
   */
  async sendSms(
    userId: string,
    dto: SendSmsDto,
    forceOutcome?: { success: boolean; response?: string },
  ): Promise<SendSmsResponse> {
    // 1. Extract recipient numbers (supports both `to` array/string and `recipient` alias)
    const rawRecipients: string[] = [];
    if (dto.to) {
      if (Array.isArray(dto.to)) {
        rawRecipients.push(...dto.to);
      } else if (typeof dto.to === 'string') {
        rawRecipients.push(dto.to);
      }
    } else if (dto.recipient) {
      rawRecipients.push(dto.recipient);
    }

    if (rawRecipients.length === 0) {
      throw new BadRequestException('At least one recipient phone number is required');
    }

    // 2. Validate and normalize every recipient number. Rejects invalid ones clearly per brief.
    const normalizedRecipients: string[] = [];
    for (const raw of rawRecipients) {
      const normalized = normalizeNepaliPhone(raw);
      normalizedRecipients.push(normalized);
    }

    // 3. Calculate segmentation parts & credit cost
    const segmentResult = calculateSmsSegments(dto.message);
    const costPerRecipient = segmentResult.cost;
    const totalCost = Number((costPerRecipient * normalizedRecipients.length).toFixed(2));

    // 4. Atomically deduct credits from user's wallet with pessimistic row locking
    // (Throws BadRequestException immediately if balance is insufficient)
    await this.walletService.deductCredits(
      userId,
      totalCost,
      undefined,
      `SMS reservation for ${normalizedRecipients.length} recipient(s) (${segmentResult.parts} part(s) each)`,
    );

    // 5. Fetch active providers ordered by priority
    const activeProviders = await this.providersService.getActiveProviders();
    const sentResponses: SendSmsResponse[] = [];

    for (const recipient of normalizedRecipients) {
      // Create initial PENDING message record
      const messageRecord = this.smsRepository.create({
        userId,
        recipient,
        message: dto.message,
        encoding: segmentResult.encoding,
        parts: segmentResult.parts,
        cost: costPerRecipient,
        status: MessageStatus.PENDING,
        providerUsed: null,
        isRefunded: false,
      });
      const savedMessage = await this.smsRepository.save(messageRecord);

      const recordedAttempts: ProviderAttempt[] = [];
      let isDelivered = false;

      // Failover Routing: Traverse active providers that have balance
      for (const provider of activeProviders) {
        // Skip provider if balance is exhausted ("Send via top-priority provider with balance")
        if (provider.balance <= 0) {
          this.logger.warn(
            `Skipping provider ${provider.name} because its balance is exhausted (${provider.balance})`,
          );
          continue;
        }

        this.logger.log(
          `Attempting SMS dispatch [Message: ${savedMessage.id}] via ${provider.name} (Priority ${provider.priority}, Balance: ${provider.balance})`,
        );

        const result = await this.providersService.sendViaProvider(
          provider,
          recipient,
          dto.message,
          forceOutcome,
        );

        // Record attempt audit log
        const attempt = await this.providersService.recordAttempt(
          savedMessage.id,
          provider,
          result.success ? AttemptStatus.SUCCESS : AttemptStatus.FAILED,
          result.latencyMs,
          result.response,
        );
        recordedAttempts.push(attempt);

        if (result.success) {
          savedMessage.status = MessageStatus.SENT;
          savedMessage.providerUsed = provider.name;
          isDelivered = true;
          this.logger.log(
            `SMS successfully delivered [Message: ${savedMessage.id}] via ${provider.name}`,
          );
          break;
        }

        // On failure, cascade to next priority route
        this.logger.warn(
          `Route ${provider.name} failed for message ${savedMessage.id}. Falling over to next route...`,
        );
      }

      // Handle Total Failure & Automatic Idempotent Refund
      if (!isDelivered) {
        this.logger.error(
          `All routes failed for message ${savedMessage.id}. Triggering automatic refund...`,
        );
        savedMessage.status = MessageStatus.FAILED;

        // Refund the deducted credits back to user's wallet idempotently
        await this.walletService.refundCredits(
          userId,
          costPerRecipient,
          savedMessage.id,
          `Automatic refund for failed SMS delivery (Message ID: ${savedMessage.id})`,
        );
        savedMessage.isRefunded = true;
      }

      await this.smsRepository.save(savedMessage);

      sentResponses.push({
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
      });
    }

    // Return the response object (enriched with results array when batch)
    const primary = sentResponses[0];
    return {
      ...primary,
      results: sentResponses,
    };
  }

  /**
   * Retrieves paginated SMS delivery history for a user.
   * Filterable by status, date, and phone number per brief requirements.
   */
  async getSmsLogs(
    userId: string,
    query: SmsQueryDto,
  ): Promise<{ messages: SmsMessage[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(100, query.limit || 20));
    const skip = (page - 1) * limit;

    const whereClause: any = { userId };

    // Filter by status (pending, sent, failed)
    if (query.status) {
      whereClause.status = query.status;
    }

    // Filter by recipient phone number
    if (query.number) {
      whereClause.recipient = Like(`%${query.number.trim()}%`);
    }

    // Filter by date (YYYY-MM-DD)
    if (query.date) {
      const dateStr = query.date.trim();
      const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
      const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);
      whereClause.createdAt = Between(startOfDay, endOfDay);
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
