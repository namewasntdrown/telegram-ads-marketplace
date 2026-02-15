import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';

export class AppealDealDto {
  @IsString()
  @IsNotEmpty()
  dealId: string;

  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class AppealChannelDto {
  @IsString()
  @IsNotEmpty()
  channelId: string;

  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class AppealFolderDto {
  @IsString()
  @IsNotEmpty()
  folderId: string;

  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class AppealPlacementDto {
  @IsString()
  @IsNotEmpty()
  folderPlacementId: string;

  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class ResolveAppealDto {
  @IsEnum(['UPHELD', 'REVERSED'])
  decision: 'UPHELD' | 'REVERSED';

  @IsString()
  @IsOptional()
  adminNotes?: string;
}

export interface AppealResponseDto {
  id: string;
  type: string;
  status: string;
  appellantId: string;
  originalAdminId?: string;
  reviewerAdminId?: string;
  reason: string;
  adminNotes?: string;
  dealId?: string;
  channelId?: string;
  folderId?: string;
  folderPlacementId?: string;
  frozenAmount?: string;
  originalResolution?: string;
  createdAt: string;
  resolvedAt?: string;
  // Related entity info
  channelTitle?: string;
  folderTitle?: string;
  dealAmount?: string;
}
