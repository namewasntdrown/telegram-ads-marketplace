import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { UserResponseDto } from '../../users/dto/user.dto';

export class TelegramAuthDto {
  @ApiProperty({ description: 'Telegram WebApp initData string' })
  @IsString()
  @IsNotEmpty()
  initData: string;
}

export class TelegramLoginWidgetDto {
  @ApiProperty({ description: 'Telegram user ID' })
  @IsNumber()
  id: number;

  @ApiProperty({ description: 'User first name' })
  @IsString()
  @IsNotEmpty()
  first_name: string;

  @ApiPropertyOptional({ description: 'User last name' })
  @IsOptional()
  @IsString()
  last_name?: string;

  @ApiPropertyOptional({ description: 'Telegram username' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ description: 'User photo URL' })
  @IsOptional()
  @IsString()
  photo_url?: string;

  @ApiProperty({ description: 'Authentication date (unix timestamp)' })
  @IsNumber()
  auth_date: number;

  @ApiProperty({ description: 'HMAC-SHA256 hash for verification' })
  @IsString()
  @IsNotEmpty()
  hash: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class AuthResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty()
  expiresIn: number;

  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;
}

export { UserResponseDto };
