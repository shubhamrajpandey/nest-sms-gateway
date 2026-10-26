import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';
import { ProviderAttempt } from '../../provider-attempts/entities/provider-attempts.entity.js';

export enum SmsEncoding {
  GSM_7 = 'GSM_7',
  UNICODE = 'UNICODE',
}

export enum MessageStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

@Entity('sms_messages')
export class SmsMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, (user) => user.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  // Normalized 10-digit Nepali mobile number (e.g. 9812345678)
  @Index()
  @Column({ type: 'varchar', length: 15 })
  recipient: string;

  @Column({ type: 'text' })
  message: string;

  @Column({
    type: 'enum',
    enum: SmsEncoding,
    default: SmsEncoding.GSM_7,
  })
  encoding: SmsEncoding;

  @Column({ type: 'int', default: 1 })
  parts: number;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 1.0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  cost: number;

  @Index()
  @Column({
    type: 'enum',
    enum: MessageStatus,
    default: MessageStatus.PENDING,
  })
  status: MessageStatus;

  // Name of the route that successfully delivered the message (e.g. ROUTE_A)
  @Column({ type: 'varchar', length: 50, nullable: true })
  providerUsed: string | null;

  // Idempotency flag: guarantees a failed message can never be refunded twice
  @Column({ type: 'boolean', default: false })
  isRefunded: boolean;

  @OneToMany(() => ProviderAttempt, (attempt: ProviderAttempt) => attempt.message, { cascade: true })
  attempts: ProviderAttempt[];

  // Indexed for fast log pagination and date-range filtering
  @Index()
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
