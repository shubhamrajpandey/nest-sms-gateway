import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  OneToMany,
  Index,
} from 'typeorm';
import { Wallet } from '../../wallet/entities/wallet.entity.js';
import { SmsMessage } from '../../sms/entities/sms-message.entity.js';


@Entity('app_users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ unique: true })
  email: string;

  // select: false ensures the password hash is never accidentally leaked in queries
  @Column({ select: false })
  password: string;

  
  @OneToOne(() => Wallet, (wallet: Wallet) => wallet.user, { cascade: true })
  wallet: Wallet;

  @OneToMany(() => SmsMessage, (message: SmsMessage) => message.user)
  messages: SmsMessage[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
