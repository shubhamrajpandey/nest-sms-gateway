import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  OneToMany,
  JoinColumn,
  Index,
  Check,
} from 'typeorm';
import type { User } from '../../users/entities/user.entity.js';
import type { WalletTransaction } from './wallet-transaction.entity.js';

@Entity('wallets')
@Check('"balance" >= 0')
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  userId: string;

  @OneToOne('User', 'wallet', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  // Stored as numeric(10, 2) in Postgres for exact precision (no floating-point rounding errors)
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  balance: number;

  @OneToMany('WalletTransaction', 'wallet', { cascade: true })
  transactions: WalletTransaction[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
