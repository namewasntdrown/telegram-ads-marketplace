import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsNotEmpty,
  Min,
  Max,
  ArrayMaxSize,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

// Regex for valid TON amount: positive number with up to 9 decimal places
const TON_AMOUNT_REGEX = /^(?!0(\.0+)?$)\d{1,12}(\.\d{1,9})?$/;
const TON_AMOUNT_MESSAGE =
  'Amount must be a positive number with up to 9 decimal places';
import { Type, Transform } from 'class-transformer';
import { CampaignStatus } from '@tam/shared-types';

export class CreateCampaignDto {
  @ApiProperty({ description: 'Campaign title' })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  title: string;

  @ApiPropertyOptional({ description: 'Campaign description' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ description: 'Total budget in TON', example: '100.5' })
  @IsString()
  @IsNotEmpty()
  @Matches(TON_AMOUNT_REGEX, { message: TON_AMOUNT_MESSAGE })
  totalBudget: string;

  @ApiProperty({
    description: 'Target channel categories',
    example: ['technology', 'business'],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  categories: string[];

  @ApiProperty({
    description: 'Target languages',
    example: ['en', 'ru'],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  targetLanguages: string[];
}

export class UpdateCampaignDto {
  @ApiPropertyOptional({ description: 'Campaign title' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({ description: 'Campaign description' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: 'Total budget in TON', example: '100.5' })
  @IsOptional()
  @IsString()
  @Matches(TON_AMOUNT_REGEX, { message: TON_AMOUNT_MESSAGE })
  totalBudget?: string;

  @ApiPropertyOptional({ description: 'Target channel categories' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  categories?: string[];

  @ApiPropertyOptional({ description: 'Target languages' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  targetLanguages?: string[];

  @ApiPropertyOptional({ description: 'Campaign status', enum: CampaignStatus })
  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;
}

export class CampaignFiltersDto {
  @ApiPropertyOptional({ description: 'Filter by status', enum: CampaignStatus })
  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class CampaignResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty()
  totalBudget: string;

  @ApiProperty()
  spentBudget: string;

  @ApiProperty()
  categories: string[];

  @ApiProperty()
  targetLanguages: string[];

  @ApiProperty({ enum: CampaignStatus })
  status: CampaignStatus;

  @ApiProperty()
  advertiserId: string;

  @ApiProperty()
  dealsCount: number;

  @ApiProperty()
  createdAt: string;
}

export class PaginatedCampaignsDto {
  @ApiProperty({ type: [CampaignResponseDto] })
  items: CampaignResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}
