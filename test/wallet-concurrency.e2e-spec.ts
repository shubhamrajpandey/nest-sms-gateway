import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('Wallet Concurrency & Double-Debit Protection (e2e)', () => {
  let app: INestApplication;
  let authToken: string;

  const testEmail = `wallet_race_${Date.now()}@example.com`;
  const testPassword = 'Password123!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    // 1. Register test user who gets 50 starting welcome credits
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: testEmail,
        password: testPassword,
      });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.user.balance).toBe(50);
    authToken = registerRes.body.accessToken;
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Race Condition & Double-Spending Prevention', () => {
    it('should handle 10 simultaneous requests with 50 credits: exactly 5 succeed, 5 fail, balance never drops below zero', async () => {
      // 1. Verify initial balance is exactly 50 credits
      const balanceCheck = await request(app.getHttpServer())
        .get('/wallet/balance')
        .set('Authorization', `Bearer ${authToken}`);

      expect(balanceCheck.status).toBe(200);
      expect(balanceCheck.body.balance).toBe(50);

      // 2. Prepare 10-part multipart SMS messages (each costs 10 credits)
      // 10 parts of 153 chars = ~1,400 chars GSM-7
      const tenPartMessage = 'A'.repeat(1400);

      // 3. Fire 10 simultaneous requests at the exact same millisecond
      // Total requested credits = 10 requests * 10 credits = 100 credits
      // Available credits = 50 credits
      const parallelRequests = Array.from({ length: 10 }).map((_, index) =>
        request(app.getHttpServer())
          .post('/sms/send')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            recipient: `984100000${index}`,
            message: tenPartMessage,
          }),
      );

      const results = await Promise.all(parallelRequests);

      // 4. Count successful dispatches (201) vs rejected dispatches (400)
      const successful = results.filter((res) => res.status === 201);
      const rejected = results.filter((res) => res.status === 400);

      // Exactly 5 requests MUST succeed (5 * 10 = 50 credits)
      expect(successful.length).toBe(5);

      // Exactly 5 requests MUST be rejected with HTTP 400 due to insufficient balance
      expect(rejected.length).toBe(5);

      // Verify rejection error message
      for (const res of rejected) {
        expect(res.body.message).toContain('Insufficient wallet balance');
      }

      // 5. Verify final balance: MUST be exactly 0.00 and NEVER negative
      const finalBalanceRes = await request(app.getHttpServer())
        .get('/wallet/balance')
        .set('Authorization', `Bearer ${authToken}`);

      expect(finalBalanceRes.status).toBe(200);
      expect(finalBalanceRes.body.balance).toBe(0);
      expect(finalBalanceRes.body.balance).toBeGreaterThanOrEqual(0);

      // 6. Verify audit transaction ledger
      const transactionsRes = await request(app.getHttpServer())
        .get('/wallet/transactions?page=1&limit=50')
        .set('Authorization', `Bearer ${authToken}`);

      expect(transactionsRes.status).toBe(200);
      const txs = transactionsRes.body.transactions;

      // 1 INITIAL (50 credits) + 5 DEBIT (10 credits each) = 6 transactions
      expect(txs.length).toBe(6);

      const debits = txs.filter((t: any) => t.type === 'DEBIT');
      expect(debits.length).toBe(5);

      const initials = txs.filter((t: any) => t.type === 'INITIAL');
      expect(initials.length).toBe(1);
    });

    it('should safely top up credits and allow new dispatches', async () => {
      // Top up 20 credits
      const topUpRes = await request(app.getHttpServer())
        .post('/wallet/topup')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount: 20 });

      expect(topUpRes.status).toBe(201);
      expect(topUpRes.body.balance).toBe(20);

      // Now a 1-credit SMS should succeed
      const sendRes = await request(app.getHttpServer())
        .post('/sms/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          recipient: '9841122334',
          message: 'Post top-up SMS',
        });

      expect(sendRes.status).toBe(201);

      // Balance should be 19
      const balanceRes = await request(app.getHttpServer())
        .get('/wallet/balance')
        .set('Authorization', `Bearer ${authToken}`);

      expect(balanceRes.body.balance).toBe(19);
    });
  });
});
