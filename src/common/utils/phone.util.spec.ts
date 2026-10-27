import { describe, it, expect } from 'vitest';
import {
  validateAndNormalizeNepaliPhone,
  normalizeNepaliPhone,
} from './phone.util.js';
import { BadRequestException } from '@nestjs/common';

describe('Nepali Phone Validation & Normalization', () => {
  describe('Valid Phone Numbers (from PDF Brief)', () => {
    it('should accept 10-digit number starting with 98 as-is', () => {
      const result = validateAndNormalizeNepaliPhone('9841234567');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('9841234567');
    });

    it('should strip +977 prefix from 98 number', () => {
      const result = validateAndNormalizeNepaliPhone('+9779801122334');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('9801122334');
    });

    it('should strip 977 prefix from 97 number', () => {
      const result = validateAndNormalizeNepaliPhone('9779761234567');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('9761234567');
    });

    it('should handle numbers with surrounding whitespace', () => {
      const result = validateAndNormalizeNepaliPhone('  9812345678  ');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('9812345678');
    });
  });

  describe('Invalid Phone Numbers (from PDF Brief)', () => {
    it('should reject numbers not starting with 97 or 98 (e.g. 9612345678)', () => {
      const result = validateAndNormalizeNepaliPhone('9612345678');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('must start with 97 or 98');
    });

    it('should reject numbers with only 9 digits (e.g. 984123456)', () => {
      const result = validateAndNormalizeNepaliPhone('984123456');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('must be 10 digits');
    });

    it('should reject numbers containing letters or symbols', () => {
      const result = validateAndNormalizeNepaliPhone('984123456a');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Only digits are allowed');
    });

    it('should reject empty or invalid inputs', () => {
      const result = validateAndNormalizeNepaliPhone('');
      expect(result.isValid).toBe(false);
    });
  });

  describe('normalizeNepaliPhone helper', () => {
    it('should return normalized string on valid input', () => {
      expect(normalizeNepaliPhone('+9779841234567')).toBe('9841234567');
    });

    it('should throw BadRequestException on invalid input', () => {
      expect(() => normalizeNepaliPhone('9612345678')).toThrow(
        BadRequestException,
      );
    });
  });
});
