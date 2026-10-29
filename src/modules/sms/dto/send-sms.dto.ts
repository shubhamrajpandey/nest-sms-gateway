import { IsNotEmpty, IsString, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendSmsDto {
  /**
   * Target recipient phone number(s). Accepts an array of phone numbers or a single number.
   * Directly matches PDF Brief: { to: string[], message }
   */
  @ApiPropertyOptional({
    example: ['9841234567'],
    description: 'Target Nepali phone number(s). 10 digits starting with 97 or 98. Optional +977 or 977 prefix allowed.',
    type: [String],
  })
  @IsOptional()
  to?: string | string[];

  /**
   * Single recipient alias for backwards compatibility.
   */
  @ApiPropertyOptional({
    example: '9841234567',
    description: 'Single recipient mobile number alias',
  })
  @IsOptional()
  @IsString({ message: 'Recipient must be a valid phone number string' })
  recipient?: string;

  @ApiProperty({
    example: 'Hello from Nest SMS Gateway!',
    description: 'Message content. GSM-7 or Unicode (Nepali Devanagari or emojis).',
    maxLength: 1600,
  })
  @IsString({ message: 'Message content must be a string' })
  @IsNotEmpty({ message: 'Message content cannot be empty' })
  @MaxLength(1600, { message: 'Message exceeds maximum length of 1600 characters' })
  message: string;
}
