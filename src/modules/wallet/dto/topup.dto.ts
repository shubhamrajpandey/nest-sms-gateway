import { IsNumber, IsPositive, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class TopUpDto {
  @Type(() => Number)
  @IsNumber({}, { message: 'Amount must be a valid number' })
  @IsPositive({ message: 'Amount must be greater than zero' })
  @Min(1, { message: 'Minimum top-up amount is 1 credit' })
  amount: number;
}
