import { Controller, Post, Body, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { User } from '../users/entities/user.entity.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({
    summary: 'Register new user',
    description:
      'Creates a user account and automatically provisions a wallet with 50 starting welcome credits.',
  })
  @ApiResponse({ status: 201, description: 'User registered successfully and wallet created with 50 credits.' })
  @ApiResponse({ status: 409, description: 'Email already exists.' })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @ApiOperation({
    summary: 'Login and get JWT token',
    description: 'Authenticates credentials using bcrypt and returns a signed JWT access token and wallet balance.',
  })
  @ApiResponse({ status: 200, description: 'Login successful. Returns accessToken and balance.' })
  @ApiResponse({ status: 401, description: 'Invalid email or password.' })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Get authenticated user profile',
    description: 'Protected profile endpoint to verify JWT bearer authentication.',
  })
  @ApiResponse({ status: 200, description: 'Authenticated user profile.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@CurrentUser() user: User) {
    return {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
    };
  }
}
