import {
  Entity,
  PrimaryGeneratedColumn,
Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ProviderAttempt } from '../../provider-attempts/entities/provider-attempts.entity.js';

@Entity('sms_providers')
export class SmsProvider {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string; // e.g. 'ROUTE_A', 'ROUTE_B', 'ROUTE_C'

  @Column({ type: 'int', default: 1 })
  priority: number; // lower number = higher priority

  @Column({ type: 'int', default: 1000 })
  balance: number; // simulated provider balance

  @Column({ type: 'float', default: 0.0 })
  failureRate: number; // e.g. 0.30 for 30% failure rate

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => ProviderAttempt, (attempt: ProviderAttempt) => attempt.provider)
  attempts: ProviderAttempt[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
