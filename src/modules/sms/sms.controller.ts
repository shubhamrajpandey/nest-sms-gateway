import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import { SmsService } from './sms.service.js';
import { SendSmsDto } from './dto/send-sms.dto.js';
import { SmsQueryDto } from './dto/sms-query.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { User } from '../users/entities/user.entity.js';

@UseGuards(JwtAuthGuard)
@Controller('sms')
export class SmsController {
  constructor(private readonly smsService: SmsService) {}

  @Post('send')
  sendSms(@CurrentUser() user: User, @Body() dto: SendSmsDto) {
    return this.smsService.sendSms(user.id, dto);
  }

  @Get('logs')
  getSmsLogs(@CurrentUser() user: User, @Query() query: SmsQueryDto) {
    return this.smsService.getSmsLogs(user.id, query);
  }

  @Get(':id')
  getSmsById(@CurrentUser() user: User, @Param('id') id: string) {
    return this.smsService.getSmsById(user.id, id);
  }
}

