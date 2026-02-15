import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
  IsIn,
  Min,
  Max,
  ArrayMaxSize,
  IsEnum,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ChannelStatus, CHANNEL_CATEGORIES, SUPPORTED_LANGUAGES } from '@tam/shared-types';

export class CreateChannelDto {
  @ApiProperty({ description: 'Telegram channel ID or @username' })
  @IsString()
  telegramId: string;

  @ApiProperty({ description: 'Price per post in TON' })
  @IsString()
  pricePerPost: string;

  @ApiProperty({
    description: 'Channel categories',
    example: ['technology', 'business'],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(5)
  categories: string[];
}

export class UpdateChannelDto {
  @ApiPropertyOptional({ description: 'Price per post in TON' })
  @IsOptional()
  @IsString()
  pricePerPost?: string;

  @ApiPropertyOptional({ description: 'Channel categories' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(5)
  categories?: string[];

  @ApiPropertyOptional({ description: 'Channel description' })
  @IsOptional()
  @IsString()
  description?: string;

  // Ad conditions
  @ApiPropertyOptional({
    description: 'Supported ad formats',
    example: ['TEXT', 'PHOTO', 'VIDEO']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(['TEXT', 'PHOTO', 'VIDEO', 'REPOST'], { each: true })
  adFormats?: string[];

  @ApiPropertyOptional({
    description: 'Post duration (e.g., 24H, 48H, 72H, WEEK, FOREVER, or custom like 12H)',
    example: '24H'
  })
  @IsOptional()
  @IsString()
  postDuration?: string;

  @ApiPropertyOptional({
    description: 'Content restrictions',
    example: ['NO_GAMBLING', 'NO_ADULT']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(['NO_GAMBLING', 'NO_ADULT', 'NO_POLITICS', 'NO_CRYPTO'], { each: true })
  restrictions?: string[];

  @ApiPropertyOptional({ description: 'Whether native ads are allowed' })
  @IsOptional()
  @IsBoolean()
  allowsNativeAds?: boolean;
}

export class ChannelFiltersDto {
  @ApiPropertyOptional({ description: 'Filter by categories' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => (typeof value === 'string' ? [value] : value))
  categories?: string[];

  @ApiPropertyOptional({ description: 'Minimum subscribers' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minSubscribers?: number;

  @ApiPropertyOptional({ description: 'Maximum subscribers' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxSubscribers?: number;

  @ApiPropertyOptional({ description: 'Minimum price in TON' })
  @IsOptional()
  @IsString()
  minPrice?: string;

  @ApiPropertyOptional({ description: 'Maximum price in TON' })
  @IsOptional()
  @IsString()
  maxPrice?: string;

  @ApiPropertyOptional({ description: 'Filter by language' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ description: 'Filter by status', enum: ChannelStatus })
  @IsOptional()
  @IsEnum(ChannelStatus)
  status?: ChannelStatus;

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

export class ChannelResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  telegramId: string;

  @ApiPropertyOptional()
  username?: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional()
  avatarUrl?: string;

  @ApiProperty()
  subscriberCount: number;

  @ApiProperty()
  avgViews: number;

  @ApiProperty()
  pricePerPost: string;

  @ApiProperty()
  categories: string[];

  @ApiProperty()
  language: string;

  @ApiProperty({ enum: ChannelStatus })
  status: ChannelStatus;

  @ApiPropertyOptional()
  rejectionReason?: string;

  @ApiProperty()
  boostAmount: string;

  @ApiPropertyOptional()
  boostUntil?: string;

  @ApiProperty()
  isBoosted: boolean;

  @ApiProperty()
  ownerId: string;

  @ApiProperty()
  createdAt: string;

  // Extended statistics
  @ApiProperty({ description: 'Engagement rate in percent' })
  engagementRate: number;

  @ApiProperty({ description: 'Subscriber growth in the last week' })
  subscriberGrowthWeek: number;

  @ApiProperty({ description: 'Subscriber growth in the last month' })
  subscriberGrowthMonth: number;

  // Audience
  @ApiPropertyOptional({ description: 'Audience geography distribution' })
  audienceGeo?: Record<string, number>;

  @ApiPropertyOptional({ description: 'Peak activity hours' })
  peakHours?: number[];

  // Trust
  @ApiPropertyOptional({ description: 'Date when channel was created on Telegram' })
  channelCreatedAt?: string;

  @ApiProperty({ description: 'Number of completed deals' })
  completedDealsCount: number;

  @ApiProperty({ description: 'Average rating (0-5)' })
  rating: number;

  @ApiProperty({ description: 'Number of reviews' })
  reviewsCount: number;

  @ApiProperty({ description: 'Success rate percentage' })
  successRate: number;

  @ApiPropertyOptional({ description: 'Average response time in minutes' })
  avgResponseTime?: number;

  // Ad conditions
  @ApiProperty({ description: 'Supported ad formats', example: ['TEXT', 'PHOTO', 'VIDEO'] })
  adFormats: string[];

  @ApiProperty({ description: 'Post duration', example: '24H' })
  postDuration: string;

  @ApiProperty({ description: 'Content restrictions', example: ['NO_GAMBLING', 'NO_ADULT'] })
  restrictions: string[];

  @ApiProperty({ description: 'Whether native ads are allowed' })
  allowsNativeAds: boolean;

  // Verification
  @ApiProperty({ description: 'Whether channel is verified (admin bot has access)' })
  isVerified: boolean;

  @ApiPropertyOptional({ description: 'When channel was verified' })
  verifiedAt?: string;

  // Verified Stats from Telegram (available for verified channels)
  @ApiProperty({ description: 'Whether verified stats from Telegram are available' })
  hasVerifiedStats: boolean;

  @ApiPropertyOptional({ description: 'Language statistics from Telegram' })
  languageStats?: Record<string, number>;

  @ApiPropertyOptional({ description: 'Telegram Premium subscriber statistics' })
  premiumStats?: { premiumPercent: number };

  @ApiPropertyOptional({ description: 'View source statistics from Telegram' })
  viewSourceStats?: Record<string, number>;

  @ApiPropertyOptional({ description: 'Views/growth history from Telegram', example: [{ date: '2026-01-01', value: 1500 }] })
  viewsHistory?: Array<{ date: string; value: number }>;

  @ApiPropertyOptional({ description: 'Followers history from Telegram', example: [{ date: '2026-01-01', value: 950 }] })
  followersHistory?: Array<{ date: string; value: number }>;

  @ApiPropertyOptional({ description: 'Last time verified stats were updated' })
  lastStatsUpdate?: string;

  @ApiPropertyOptional({
    description: 'Telegram growth stats with current values, changes, and percentages',
    example: {
      followers: { current: 961, change: -30, percent: -3.0 },
      viewsPerPost: { current: 50, change: -6, percent: -10.7 },
      sharesPerPost: { current: 5, change: 1, percent: 25.0 },
    },
  })
  telegramGrowthStats?: {
    followers: { current: number; change: number; percent: number };
    viewsPerPost: { current: number; change: number; percent: number };
    sharesPerPost: { current: number; change: number; percent: number };
  };
}

export class PaginatedChannelsDto {
  @ApiProperty({ type: [ChannelResponseDto] })
  items: ChannelResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}

export class CreateChannelByLinkDto {
  @ApiProperty({
    description: 'Channel link (@username, t.me/username, or https://t.me/username)',
    example: '@mychannel',
  })
  @IsString()
  link: string;

  @ApiProperty({ description: 'Price per post in TON' })
  @IsString()
  pricePerPost: string;

  @ApiProperty({
    description: 'Channel categories',
    example: ['technology', 'business'],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(5)
  categories: string[];
}

export class BoostChannelDto {
  @ApiProperty({ description: 'Number of days to boost', minimum: 1, maximum: 30 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  days: number;

  @ApiProperty({ description: 'Amount in TON per day' })
  @IsString()
  amountPerDay: string;
}

export class UpdateChannelStatusDto {
  @ApiProperty({ description: 'New status', enum: ChannelStatus })
  @IsEnum(ChannelStatus)
  status: ChannelStatus;

  @ApiPropertyOptional({ description: 'Reason for rejection (if status is REJECTED)' })
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class VerifiedStatsResponseDto {
  @ApiProperty({ description: 'Whether verified stats are available' })
  hasVerifiedStats: boolean;

  @ApiPropertyOptional({ description: 'Language statistics from Telegram', example: { ru: 45, en: 30, uk: 15 } })
  languageStats?: Record<string, number>;

  @ApiPropertyOptional({ description: 'Premium subscriber statistics' })
  premiumStats?: {
    premiumPercent: number;
  };

  @ApiPropertyOptional({ description: 'View source statistics' })
  viewSourceStats?: Record<string, number>;

  @ApiPropertyOptional({ description: 'Last time verified stats were updated' })
  lastStatsUpdate?: string;
}
