import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { SmsProvider } from '../../providers/entities/sms-provider.entity.js';
import { SmsMessage } from '../../sms/entities/sms-message.entity.js';

export enum AttemptStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

@Entity('provider_attempts')
export class ProviderAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  messageId: string;

  @ManyToOne(() => SmsMessage, (msg: SmsMessage) => msg.attempts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'messageId' })
  message: SmsMessage;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  providerId: string | null;

  @ManyToOne(() => SmsProvider, (p: SmsProvider) => p.attempts, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'providerId' })
  provider: SmsProvider | null;

  @Index()
  @Column({ type: 'varchar', length: 50 })
  providerName: string; // e.g. 'ROUTE_A', 'ROUTE_B'

  @Index()
  @Column({
    type: 'enum',
    enum: AttemptStatus,
  })
  status: AttemptStatus;

  @Column({ type: 'text', nullable: true })
  response: string | null;

  @Column({ type: 'int', nullable: true })
  latencyMs: number | null;

  // Indexed for high-performance 24-hour route health queries
  @Index()
  @CreateDateColumn()
  createdAt: Date;
}