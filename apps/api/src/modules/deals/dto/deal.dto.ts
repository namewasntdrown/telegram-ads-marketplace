import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsBoolean,
  IsNotEmpty,
  Min,
  Max,
  ArrayMaxSize,
  MaxLength,
  IsDateString,
  Matches,
} from 'class-validator';

// Regex for valid TON amount: positive number with up to 9 decimal places
const TON_AMOUNT_REGEX = /^(?!0(\.0+)?$)\d{1,12}(\.\d{1,9})?$/;
const TON_AMOUNT_MESSAGE =
  'Amount must be a positive number with up to 9 decimal places';
import { Type, Transform } from 'class-transformer';
import { ContentType, DealStatus, DisputeReason } from '@tam/shared-types';

export class CreateDealDto {
  @ApiProperty({ description: 'Campaign ID' })
  @IsString()
  campaignId: string;

  @ApiProperty({ description: 'Channel ID' })
  @IsString()
  channelId: string;

  @ApiProperty({ description: 'Deal amount in TON', example: '10.5' })
  @IsString()
  @IsNotEmpty()
  @Matches(TON_AMOUNT_REGEX, { message: TON_AMOUNT_MESSAGE })
  amount: string;

  @ApiProperty({ description: 'Content type', enum: ContentType })
  @IsEnum(ContentType)
  contentType: ContentType;

  @ApiPropertyOptional({ description: 'Content text' })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  contentText?: string;

  @ApiPropertyOptional({ description: 'Media URLs (https only)' })
  @IsOptional()
  @IsArray()
  @IsUrl(
    { protocols: ['https'], require_protocol: true },
    { each: true, message: 'Each media URL must be a valid HTTPS URL' }
  )
  @ArrayMaxSize(10)
  contentMediaUrls?: string[];

  @ApiPropertyOptional({ description: 'Scheduled post time (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  scheduledPostTime?: string;

  @ApiPropertyOptional({ description: 'Minimum views required' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minViewsRequired?: number;
}

export class SubmitContentDto {
  @ApiPropertyOptional({ description: 'Content text' })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  contentText?: string;

  @ApiPropertyOptional({ description: 'Media URLs (https only)' })
  @IsOptional()
  @IsArray()
  @IsUrl(
    { protocols: ['https'], require_protocol: true },
    { each: true, message: 'Each media URL must be a valid HTTPS URL' }
  )
  @ArrayMaxSize(10)
  contentMediaUrls?: string[];
}

export class ReviewContentDto {
  @ApiProperty({ description: 'Whether to approve the content' })
  @IsBoolean()
  approved: boolean;

  @ApiPropertyOptional({ description: 'Rejection reason if not approved' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  rejectionReason?: string;
}

export class RejectContentDto {
  @ApiProperty({ description: 'Revision note for the channel owner' })
  @IsString()
  @MaxLength(2000)
  revisionNote: string;
}

export class ApplyToCampaignDto {
  @ApiProperty({ description: 'Campaign ID to apply to' })
  @IsString()
  campaignId: string;

  @ApiProperty({ description: 'Channel ID to use for this deal' })
  @IsString()
  channelId: string;

  @ApiPropertyOptional({ description: 'Application note' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  applicationNote?: string;

  @ApiPropertyOptional({ description: 'Proposed amount in TON' })
  @IsOptional()
  @IsString()
  proposedAmount?: string;
}

export class SendMessageDto {
  @ApiProperty({ description: 'Message text' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text: string;
}

export class DisputeDealDto {
  @ApiProperty({ description: 'Dispute reason', enum: DisputeReason })
  @IsEnum(DisputeReason)
  reason: DisputeReason;

  @ApiProperty({ description: 'Dispute description' })
  @IsString()
  @MaxLength(2000)
  description: string;
}

export class DealFiltersDto {
  @ApiPropertyOptional({ description: 'Filter by status', enum: DealStatus })
  @IsOptional()
  @IsEnum(DealStatus)
  status?: DealStatus;

  @ApiPropertyOptional({ description: 'Filter by campaign ID' })
  @IsOptional()
  @IsString()
  campaignId?: string;

  @ApiPropertyOptional({ description: 'Filter by channel ID' })
  @IsOptional()
  @IsString()
  channelId?: string;

  @ApiPropertyOptional({ description: 'Filter role', enum: ['advertiser', 'channel_owner'] })
  @IsOptional()
  @IsString()
  role?: 'advertiser' | 'channel_owner';

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

export class DealResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  amount: string;

  @ApiProperty()
  platformFee: string;

  @ApiProperty({ enum: DealStatus })
  status: DealStatus;

  @ApiProperty({ enum: ContentType })
  contentType: ContentType;

  @ApiPropertyOptional()
  contentText?: string;

  @ApiProperty()
  contentMediaUrls: string[];

  @ApiPropertyOptional()
  postUrl?: string;

  @ApiPropertyOptional()
  scheduledPostTime?: string;

  @ApiPropertyOptional()
  actualPostTime?: string;

  @ApiPropertyOptional()
  minViewsRequired?: number;

  @ApiPropertyOptional()
  viewsAtVerification?: number;

  @ApiPropertyOptional()
  verificationDeadline?: string;

  @ApiPropertyOptional({ enum: DisputeReason })
  disputeReason?: DisputeReason;

  @ApiPropertyOptional()
  disputeDescription?: string;

  @ApiProperty()
  campaignId: string;

  @ApiProperty()
  channelId: string;

  @ApiProperty()
  advertiserId: string;

  @ApiProperty()
  channelOwnerId: string;

  @ApiPropertyOptional({ description: 'Channel title (included when available)' })
  channelTitle?: string;

  @ApiPropertyOptional({ description: 'Channel username (included when available)' })
  channelUsername?: string;

  @ApiPropertyOptional({ description: 'Campaign title (included when available)' })
  campaignTitle?: string;

  @ApiPropertyOptional({ description: 'Brief text from advertiser' })
  briefText?: string;

  @ApiPropertyOptional({ description: 'Brief media URLs' })
  briefMediaUrls?: string[];

  @ApiPropertyOptional({ description: 'Draft content text from channel owner' })
  draftContentText?: string;

  @ApiPropertyOptional({ description: 'Draft content media URLs' })
  draftContentMediaUrls?: string[];

  @ApiPropertyOptional({ description: 'Content revision note' })
  contentRevisionNote?: string;

  @ApiPropertyOptional({ description: 'Number of content revisions' })
  contentRevisionCount?: number;

  @ApiPropertyOptional({ description: 'Ad format' })
  adFormat?: string;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}

export class DealMessageResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  dealId: string;

  @ApiProperty()
  senderId: string;

  @ApiPropertyOptional()
  senderName?: string;

  @ApiProperty()
  text: string;

  @ApiProperty()
  createdAt: string;
}

export class PaginatedDealsDto {
  @ApiProperty({ type: [DealResponseDto] })
  items: DealResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}
