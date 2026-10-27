import { BadRequestException } from '@nestjs/common';

export interface PhoneValidationResult {
  isValid: boolean;
  normalized?: string;
  error?: string;
}

/**
 * Validates and normalizes a Nepali mobile phone number:
 * - 10 digits starting with 97 or 98
 * - Optional +977 or 977 prefix is allowed and stripped to the 10-digit form
 */
export function validateAndNormalizeNepaliPhone(
  phone: string,
): PhoneValidationResult {
  if (!phone || typeof phone !== 'string') {
    return {
      isValid: false,
      error: 'Phone number must be a non-empty string',
    };
  }

  // Remove surrounding whitespace
  let cleaned = phone.trim();

  // 1. Strip +977 prefix if present
  if (cleaned.startsWith('+977')) {
    cleaned = cleaned.slice(4);
  }
  // 2. Strip 977 prefix if present (only when full 13 digits)
  else if (cleaned.startsWith('977') && cleaned.length === 13) {
    cleaned = cleaned.slice(3);
  }

  // 3. Check for non-numeric characters
  if (!/^\d+$/.test(cleaned)) {
    return {
      isValid: false,
      error: `Phone number '${phone}' contains invalid characters. Only digits are allowed.`,
    };
  }

  // 4. Validate exact 10 digits
  if (cleaned.length !== 10) {
    return {
      isValid: false,
      error: `Phone number '${phone}' must be 10 digits (received ${cleaned.length} digits)`,
    };
  }

  // 5. Must start with 97 or 98
  if (!cleaned.startsWith('98') && !cleaned.startsWith('97')) {
    return {
      isValid: false,
      error: `Phone number '${phone}' must start with 97 or 98 (received '${cleaned}')`,
    };
  }

  return {
    isValid: true,
    normalized: cleaned,
  };
}

/**
 * Normalizes a Nepali mobile number or throws a BadRequestException if invalid
 */
export function normalizeNepaliPhone(phone: string): string {
  const result = validateAndNormalizeNepaliPhone(phone);
  if (!result.isValid || !result.normalized) {
    throw new BadRequestException(result.error);
  }
  return result.normalized;
}
