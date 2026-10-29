import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { WalletService } from './wallet.service.js';
import { TopUpDto } from './dto/topup.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { User } from '../users/entities/user.entity.js';

@ApiTags('Wallet')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @ApiOperation({
    summary: 'Get current wallet balance',
    description: 'Retrieves current available SMS credit balance for the authenticated user.',
  })
  @ApiResponse({ status: 200, description: 'Current wallet balance.' })
  @Get('balance')
  getBalance(@CurrentUser() user: User) {
    return this.walletService.getBalance(user.id);
  }

  @ApiOperation({
    summary: 'Top up wallet credits',
    description: 'Atomically increments user wallet balance using row-level locking and records TOPUP transaction.',
  })
  @ApiResponse({ status: 201, description: 'Wallet topped up successfully.' })
  @Post('topup')
  topUp(@CurrentUser() user: User, @Body() dto: TopUpDto) {
    return this.walletService.topUp(user.id, dto.amount);
  }

  @ApiOperation({
    summary: 'Get transaction audit history',
    description: 'Returns paginated ledger entries (INITIAL, TOPUP, DEBIT, REFUND) for the user wallet.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiResponse({ status: 200, description: 'Paginated transactions list.' })
  @Get('transactions')
  getTransactions(
    @CurrentUser() user: User,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.walletService.getTransactions(
      user.id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }
}
