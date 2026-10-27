import { SmsEncoding } from '../../modules/sms/entities/sms-message.entity.js';

export interface SmsCounterResult {
  encoding: SmsEncoding;
  characterCount: number;
  parts: number;
  cost: number;
  isUnicode: boolean;
}

// Standard 128 GSM-7 7-bit default alphabet
const GSM_7_BASIC = new Set([
  '@', '£', '$', '¥', 'è', 'é', 'ù', 'ì', 'ò', 'Ç', '\n', 'Ø', 'ø', '\r', 'Å', 'å',
  'Δ', '_', 'Φ', 'Γ', 'Λ', 'Ω', 'Π', 'Ψ', 'Σ', 'Θ', 'Ξ', 'Æ', 'æ', 'ß', 'É',
  ' ', '!', '"', '#', '¤', '%', '&', "'", '(', ')', '*', '+', ',', '-', '.', '/',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ':', ';', '<', '=', '>', '?',
  '¡', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O',
  'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'Ä', 'Ö', 'Ñ', 'Ü', '§',
  '¿', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o',
  'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'ä', 'ö', 'ñ', 'ü', 'à',
]);

// GSM-7 Extension Table characters (Each consumes 2 GSM-7 characters)
const GSM_7_EXTENDED = new Set([
  '^', '{', '}', '\\', '[', '~', ']', '|', '€', '\f',
]);

/**
 * Calculates SMS encoding, character count, segment parts, and credit cost.
 *
:
 * - GSM-7: 1 part <= 160 chars; Multipart = parts of 153 chars.
 * - Unicode: 1 part <= 70 chars; Multipart = parts of 67 chars.
 * - GSM-7 extension table characters count as 2 characters.
 * - Any character outside GSM-7 (e.g. Nepali Devanagari or emoji) switches entire message to Unicode.
 */
export function calculateSmsSegments(message: string): SmsCounterResult {
  if (!message || message.length === 0) {
    return {
      encoding: SmsEncoding.GSM_7,
      characterCount: 0,
      parts: 0,
      cost: 0,
      isUnicode: false,
    };
  }

  let isUnicode = false;
  let gsmCharacterUnits = 0;

  // Check each character for GSM-7 vs Unicode
  for (let i = 0; i < message.length; i++) {
    const char = message[i];

    if (GSM_7_EXTENDED.has(char)) {
      gsmCharacterUnits += 2; // Extension characters count as 2 chars in GSM-7
    } else if (GSM_7_BASIC.has(char)) {
      gsmCharacterUnits += 1;
    } else {
      isUnicode = true;
      break;
    }
  }

  if (isUnicode) {
    // Unicode encoding (UCS-2 / UTF-16 code units)
    const totalChars = message.length;
    let parts: number;

    if (totalChars <= 70) {
      parts = 1;
    } else {
      parts = Math.ceil(totalChars / 67);
    }

    return {
      encoding: SmsEncoding.UNICODE,
      characterCount: totalChars,
      parts,
      cost: parts * 1.0, // 1 credit per SMS part
      isUnicode: true,
    };
  }

  // GSM-7 encoding
  let parts: number;
  if (gsmCharacterUnits <= 160) {
    parts = 1;
  } else {
    parts = Math.ceil(gsmCharacterUnits / 153);
  }

  return {
    encoding: SmsEncoding.GSM_7,
    characterCount: gsmCharacterUnits,
    parts,
    cost: parts * 1.0, // 1 credit per SMS part
    isUnicode: false,
  };
}
