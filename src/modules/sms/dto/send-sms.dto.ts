import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendSmsDto {
  @IsString({ message: 'Recipient must be a valid phone number string' })
  @IsNotEmpty({ message: 'Recipient phone number is required' })
  recipient: string;

  @IsString({ message: 'Message content must be a string' })
  @IsNotEmpty({ message: 'Message content cannot be empty' })
  @MaxLength(1600, { message: 'Message exceeds maximum length of 1600 characters' })
  message: string;
}

