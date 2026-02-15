import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';
import { validateTonAddress } from '@tam/security';

export class UpdateUserDto {
  @ApiPropertyOptional({ description: 'TON wallet address' })
  @IsOptional()
  @IsString()
  @Matches(/^[UEkK][Qf][a-zA-Z0-9_-]{46}$|^-?\d:[a-fA-F0-9]{64}$/, {
    message: 'Invalid TON address format',
  })
  walletAddress?: string;
}

export class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  telegramId: string;

  @ApiPropertyOptional()
  username?: string;

  @ApiPropertyOptional()
  firstName?: string;

  @ApiPropertyOptional()
  lastName?: string;

  @ApiPropertyOptional()
  photoUrl?: string;

  @ApiPropertyOptional()
  walletAddress?: string;

  @ApiProperty()
  role: string;

  @ApiProperty()
  balanceTon: string;

  @ApiProperty()
  frozenTon: string;

  @ApiProperty()
  createdAt: string;
}

export class UserStatsDto {
  @ApiProperty()
  totalDeals: number;

  @ApiProperty()
  activeDeals: number;

  @ApiProperty()
  completedDeals: number;

  @ApiProperty()
  totalChannels: number;

  @ApiProperty()
  totalCampaigns: number;

  @ApiProperty()
  totalSpent: string;

  @ApiProperty()
  totalEarned: string;
}
