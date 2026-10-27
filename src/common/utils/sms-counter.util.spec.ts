import { describe, it, expect } from 'vitest';
import { calculateSmsSegments } from './sms-counter.util.js';
import { SmsEncoding } from '../../modules/sms/entities/sms-message.entity.js';

describe('SMS Segmentation Engine (from Nest Nepal Brief)', () => {
  describe('GSM-7 Encoding', () => {
    it('should calculate 1 part for a short English GSM message', () => {
      const result = calculateSmsSegments('Hello, world!');
      expect(result.encoding).toBe(SmsEncoding.GSM_7);
      expect(result.isUnicode).toBe(false);
      expect(result.characterCount).toBe(13);
      expect(result.parts).toBe(1);
      expect(result.cost).toBe(1.0);
    });

    it('should hold up to 160 characters in 1 single GSM part', () => {
      const msg160 = 'A'.repeat(160);
      const result = calculateSmsSegments(msg160);
      expect(result.encoding).toBe(SmsEncoding.GSM_7);
      expect(result.characterCount).toBe(160);
      expect(result.parts).toBe(1);
      expect(result.cost).toBe(1.0);
    });

    it('should segment a 200-character English message into 2 parts (153 + 47) per brief', () => {
      // From brief: "a 200-character English message is 2 parts (153 + 47)"
      const msg200 = 'A'.repeat(200);
      const result = calculateSmsSegments(msg200);
      expect(result.encoding).toBe(SmsEncoding.GSM_7);
      expect(result.characterCount).toBe(200);
      expect(result.parts).toBe(2);
      expect(result.cost).toBe(2.0);
    });

    it('should count GSM-7 extension characters as 2 characters each', () => {
      // '[', ']', and '€' are extension characters
      const result = calculateSmsSegments('Price: [€50]');
      // 'Price: ' = 7 chars
      // '[' = 2 chars
      // '€' = 2 chars
      // '50' = 2 chars
      // ']' = 2 chars
      // Total = 7 + 2 + 2 + 2 + 2 = 15 GSM units
      expect(result.encoding).toBe(SmsEncoding.GSM_7);
      expect(result.characterCount).toBe(15);
      expect(result.parts).toBe(1);
    });
  });

  describe('Unicode Encoding', () => {
    it('should detect Nepali Devanagari text as Unicode and hold up to 70 chars in 1 part', () => {
      const nepaliMsg = 'नमस्ते साथी';
      const result = calculateSmsSegments(nepaliMsg);
      expect(result.encoding).toBe(SmsEncoding.UNICODE);
      expect(result.isUnicode).toBe(true);
      expect(result.parts).toBe(1);
      expect(result.cost).toBe(1.0);
    });

    it('should segment a 100-character Nepali message into 2 parts (67 + 33) per brief', () => {
      // From brief: "A 100-character Nepali message is also 2 parts (67 + 33)"
      const nepali100 = 'क'.repeat(100);
      const result = calculateSmsSegments(nepali100);
      expect(result.encoding).toBe(SmsEncoding.UNICODE);
      expect(result.characterCount).toBe(100);
      expect(result.parts).toBe(2);
      expect(result.cost).toBe(2.0);
    });

    it('should convert the entire message to Unicode if it contains a single emoji per brief', () => {
      // From brief: "One emoji in an English message makes the whole message Unicode."
      const msgWithEmoji = 'Hello from Nest Nepal 😊';
      const result = calculateSmsSegments(msgWithEmoji);
      expect(result.encoding).toBe(SmsEncoding.UNICODE);
      expect(result.isUnicode).toBe(true);
      expect(result.parts).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty messages gracefully', () => {
      const result = calculateSmsSegments('');
      expect(result.parts).toBe(0);
      expect(result.cost).toBe(0);
    });
  });
});
