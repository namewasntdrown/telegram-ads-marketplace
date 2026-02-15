import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  Max,
  ArrayMaxSize,
  IsEnum,
  IsDecimal,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export enum FolderStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  REJECTED = 'REJECTED',
}

export class CreateFolderDto {
  @ApiProperty({
    description: 'Folder link (t.me/addlist/hash)',
    example: 't.me/addlist/abc123',
  })
  @IsString()
  link: string;

  @ApiProperty({ description: 'Folder title' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ description: 'Folder description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Folder categories',
    example: ['technology', 'business'],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(5)
  categories: string[];
}

export class UpdateFolderDto {
  @ApiPropertyOptional({ description: 'Folder title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Folder description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Folder categories' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(5)
  categories?: string[];

  @ApiPropertyOptional({ description: 'Price per channel placement in TON (null = free)' })
  @IsOptional()
  @IsString()
  pricePerChannel?: string | null;

  @ApiPropertyOptional({ description: 'Collection deadline (ISO date string)' })
  @IsOptional()
  @IsString()
  collectionDeadline?: string | null;

  @ApiPropertyOptional({ description: 'Maximum number of channels' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxChannels?: number | null;

  @ApiPropertyOptional({ description: 'Minimum subscriber count required' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minSubscribers?: number | null;
}

export class FolderFiltersDto {
  @ApiPropertyOptional({ description: 'Filter by categories' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => (typeof value === 'string' ? [value] : value))
  categories?: string[];

  @ApiPropertyOptional({ description: 'Filter by status', enum: FolderStatus })
  @IsOptional()
  @IsEnum(FolderStatus)
  status?: FolderStatus;

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

export class FolderResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty()
  folderLink: string;

  @ApiPropertyOptional()
  folderHash?: string;

  @ApiProperty()
  categories: string[];

  @ApiProperty({ enum: FolderStatus })
  status: FolderStatus;

  @ApiProperty()
  boostAmount: string;

  @ApiPropertyOptional()
  boostUntil?: string;

  @ApiProperty()
  isBoosted: boolean;

  @ApiPropertyOptional({ description: 'Price per channel placement in TON (null = free)' })
  pricePerChannel?: string;

  @ApiPropertyOptional({ description: 'Collection deadline' })
  collectionDeadline?: string;

  @ApiPropertyOptional({ description: 'Maximum number of channels' })
  maxChannels?: number;

  @ApiPropertyOptional({ description: 'Minimum subscriber count required' })
  minSubscribers?: number;

  @ApiProperty()
  ownerId: string;

  @ApiProperty()
  createdAt: string;
}

export class PaginatedFoldersDto {
  @ApiProperty({ type: [FolderResponseDto] })
  items: FolderResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}

export class BoostFolderDto {
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

export class UpdateFolderStatusDto {
  @ApiProperty({ description: 'New status', enum: FolderStatus })
  @IsEnum(FolderStatus)
  status: FolderStatus;

  @ApiPropertyOptional({ description: 'Reason for rejection (if status is REJECTED)' })
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class SetPricePerChannelDto {
  @ApiPropertyOptional({ description: 'Price per channel in TON (null = free)' })
  @IsOptional()
  @IsString()
  pricePerChannel?: string | null;
}
