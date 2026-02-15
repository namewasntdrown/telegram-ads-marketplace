import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import {
  TelegramAuthDto,
  TelegramLoginWidgetDto,
  RefreshTokenDto,
  AuthResponseDto,
} from './dto/auth.dto';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('telegram')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Authenticate with Telegram WebApp initData' })
  async telegramAuth(@Body() dto: TelegramAuthDto): Promise<AuthResponseDto> {
    return this.authService.authenticateWithTelegram(dto.initData);
  }

  @Post('telegram/login-widget')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Authenticate with Telegram Login Widget' })
  async telegramLoginWidget(@Body() dto: TelegramLoginWidgetDto): Promise<AuthResponseDto> {
    return this.authService.authenticateWithLoginWidget(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Refresh access token' })
  async refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout and revoke all refresh tokens' })
  async logout(@CurrentUser() user: CurrentUserData): Promise<void> {
    return this.authService.logout(user.id);
  }
}
