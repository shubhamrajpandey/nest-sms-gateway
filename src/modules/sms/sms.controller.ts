import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { SmsService } from './sms.service.js';
import { SendSmsDto } from './dto/send-sms.dto.js';
import { SmsQueryDto } from './dto/sms-query.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { User } from '../users/entities/user.entity.js';

@ApiTags('SMS')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('sms')
export class SmsController {
  constructor(private readonly smsService: SmsService) {}

  @ApiOperation({
    summary: 'Send an SMS with prioritized failover',
    description:
      'Validates recipient(s), computes segment parts and cost, deducts credits atomically, and dispatches via top-priority provider with balance (ROUTE_A -> ROUTE_B -> ROUTE_C). Automatically refunds credits if all routes fail.',
  })
  @ApiResponse({
    status: 201,
    description: 'SMS accepted and dispatched. Returns delivery status, provider used, parts, cost, and attempts.',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (invalid Nepali phone number or insufficient credits).',
  })
  @Post('send')
  sendSms(@CurrentUser() user: User, @Body() dto: SendSmsDto) {
    return this.smsService.sendSms(user.id, dto);
  }

  @ApiOperation({
    summary: 'Get paginated SMS delivery logs',
    description: 'Returns sent messages filterable by delivery status (PENDING, SENT, FAILED), recipient number, and date.',
  })
  @ApiResponse({ status: 200, description: 'Paginated SMS delivery logs.' })
  @Get('logs')
  getSmsLogs(@CurrentUser() user: User, @Query() query: SmsQueryDto) {
    return this.smsService.getSmsLogs(user.id, query);
  }

  @ApiOperation({
    summary: 'Get SMS message details by ID',
    description: 'Retrieves complete metadata and delivery attempts for a single message.',
  })
  @ApiParam({ name: 'id', description: 'SMS message UUID' })
  @ApiResponse({ status: 200, description: 'SMS message record with delivery attempt details.' })
  @ApiResponse({ status: 404, description: 'Message not found.' })
  @Get(':id')
  getSmsById(@CurrentUser() user: User, @Param('id') id: string) {
    return this.smsService.getSmsById(user.id, id);
  }
}
