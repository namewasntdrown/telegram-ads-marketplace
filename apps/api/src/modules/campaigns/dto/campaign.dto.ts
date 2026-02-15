import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
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

  @ApiPropertyOptional({ description: 'Brief text for channel owners' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  briefText?: string;

  @ApiPropertyOptional({ description: 'Requirements for channel owners' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  requirements?: string;

  @ApiPropertyOptional({ description: 'Make campaign publicly visible to channel owners' })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ description: 'Minimum subscribers required for channel' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minSubscribers?: number;

  @ApiPropertyOptional({ description: 'Maximum budget per deal in TON' })
  @IsOptional()
  @IsString()
  maxBudgetPerDeal?: string;
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

  @ApiPropertyOptional({ description: 'Brief text for channel owners' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  briefText?: string;

  @ApiPropertyOptional({ description: 'Requirements for channel owners' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  requirements?: string;

  @ApiPropertyOptional({ description: 'Make campaign publicly visible' })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ description: 'Minimum subscribers required' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minSubscribers?: number;

  @ApiPropertyOptional({ description: 'Maximum budget per deal in TON' })
  @IsOptional()
  @IsString()
  maxBudgetPerDeal?: string;
}

export class PublicCampaignFiltersDto {
  @ApiPropertyOptional({ description: 'Filter by categories' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => (typeof value === 'string' ? [value] : value))
  categories?: string[];

  @ApiPropertyOptional({ description: 'Filter by target languages' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => (typeof value === 'string' ? [value] : value))
  targetLanguages?: string[];

  @ApiPropertyOptional({ description: 'Search by title or brief text' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: 'Sort order', enum: ['newest', 'budget_high', 'budget_low'] })
  @IsOptional()
  @IsString()
  sortBy?: 'newest' | 'budget_high' | 'budget_low';

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

  @ApiPropertyOptional({ description: 'Brief text for channel owners' })
  briefText?: string;

  @ApiPropertyOptional({ description: 'Requirements' })
  requirements?: string;

  @ApiProperty({ description: 'Whether campaign is publicly visible' })
  isPublic: boolean;

  @ApiPropertyOptional({ description: 'Minimum subscribers required' })
  minSubscribers?: number;

  @ApiPropertyOptional({ description: 'Maximum budget per deal' })
  maxBudgetPerDeal?: string;

  @ApiPropertyOptional({ description: 'Advertiser username (for public campaigns)' })
  advertiserUsername?: string;

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
