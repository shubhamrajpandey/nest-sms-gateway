import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('SMS Gateway (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let sentMessageId: string;

  const testEmail = `sms_e2e_${Date.now()}@example.com`;
  const testPassword = 'Password123!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Enable same validation pipe as main.ts
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    // Register test user (automatically gets 50 starting credits)
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: testEmail,
        password: testPassword,
      });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.accessToken).toBeDefined();
    authToken = registerRes.body.accessToken;
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /sms/send - GSM-7 Standard Messages', () => {
    it('should successfully dispatch a standard GSM-7 SMS (1 part, 1 credit)', async () => {
      const response = await request(app.getHttpServer())
        .post('/sms/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          recipient: '9841234567',
          message: 'Hello from Nest Nepal SMS Gateway E2E!',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.recipient).toBe('9841234567');
      expect(response.body.encoding).toBe('GSM_7');
      expect(response.body.parts).toBe(1);
      expect(response.body.cost).toBe(1);
      expect(Array.isArray(response.body.attempts)).toBe(true);
      expect(response.body.attempts.length).toBeGreaterThanOrEqual(1);

      sentMessageId = response.body.id;
    });

    it('should normalize +977 prefix and strip whitespace on send', async () => {
      const response = await request(app.getHttpServer())
        .post('/sms/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          recipient: '  +9779801122334  ',
          message: 'Testing phone normalization with country code',
        });

      expect(response.status).toBe(201);
      expect(response.body.recipient).toBe('9801122334');
    });
  });

  describe('POST /sms/send - Unicode Messages', () => {
    it('should detect Devanagari text as Unicode and deduct correct credits', async () => {
      const response = await request(app.getHttpServer())
        .post('/sms/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          recipient: '9812345678',
          message: 'नमस्ते नेपाल! यो एक परीक्षण सन्देश हो।',
        });

      expect(response.status).toBe(201);
      expect(response.body.encoding).toBe('UNICODE');
      expect(response.body.parts).toBe(1);
      expect(response.body.cost).toBe(1);
    });

    it('should treat English text with emoji as Unicode (70 chars per part)', async () => {
      const response = await request(app.getHttpServer())
        .post('/sms/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          recipient: '9812345678',
          message: 'Special holiday promotion! 🎉 Enjoy your discount.',
        });

      expect(response.status).toBe(201);
      expect(response.body.encoding).toBe('UNICODE');
    });
  });

  describe('POST /sms/send - Validation & Error Handling', () => {
    it('should reject invalid Nepali mobile numbers (e.g. 96 prefix)', async () => {
      const response = await request(app.getHttpServer())
        .post('/sms/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          recipient: '9612345678',
          message: 'Invalid prefix number',
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('must start with 97 or 98');
    });

    it('should reject numbers with less than 10 digits', async () => {
      const response = await request(app.getHttpServer())
        .post('/sms/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          recipient: '98412345',
          message: 'Too short',
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('must be 10 digits');
    });

    it('should reject empty message content', async () => {
      const response = await request(app.getHttpServer())
        .post('/sms/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          recipient: '9841234567',
          message: '',
        });

      expect(response.status).toBe(400);
    });

    it('should reject unauthenticated requests without JWT token', async () => {
      const response = await request(app.getHttpServer())
        .post('/sms/send')
        .send({
          recipient: '9841234567',
          message: 'No auth token',
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /sms/logs & GET /sms/:id', () => {
    it('should retrieve paginated SMS logs for the authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .get('/sms/logs?page=1&limit=10')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('messages');
      expect(response.body).toHaveProperty('total');
      expect(response.body.messages.length).toBeGreaterThanOrEqual(1);
      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(10);
    });

    it('should retrieve single SMS detail with its route attempt history', async () => {
      expect(sentMessageId).toBeDefined();

      const response = await request(app.getHttpServer())
        .get(`/sms/${sentMessageId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(sentMessageId);
      expect(response.body.recipient).toBe('9841234567');
      expect(Array.isArray(response.body.attempts)).toBe(true);
    });
  });

  describe('GET /routes/health (Phase 6 Integration)', () => {
    it('should return operational health report for all providers over last 24h', async () => {
      const response = await request(app.getHttpServer())
        .get('/routes/health?hours=24')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.windowHours).toBe(24);
      expect(response.body).toHaveProperty('summary');
      expect(response.body.summary.totalRoutes).toBeGreaterThanOrEqual(3);
      expect(Array.isArray(response.body.routes)).toBe(true);

      const routeNames = response.body.routes.map((r: any) => r.providerName);
      expect(routeNames).toContain('ROUTE_A');
      expect(routeNames).toContain('ROUTE_B');
      expect(routeNames).toContain('ROUTE_C');
    });
  });
});
