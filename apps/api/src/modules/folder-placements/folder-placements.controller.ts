import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  HttpCode,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FolderPlacementsService } from './folder-placements.service';
import {
  CreateFolderPlacementDto,
  ApprovePlacementDto,
  RejectPlacementDto,
  FolderPlacementResponseDto,
  PaginatedPlacementsDto,
  FolderPlacementFiltersDto,
} from './dto/folder-placement.dto';
import { FolderPlacementStatus } from '@tam/shared-types';

@Controller()
@UseGuards(AuthGuard('jwt'))
export class FolderPlacementsController {
  constructor(
    private readonly folderPlacementsService: FolderPlacementsService,
  ) {}

  /**
   * Create a placement request for a channel in a folder
   * POST /folders/:id/placements
   */
  @Post('folders/:id/placements')
  @HttpCode(HttpStatus.CREATED)
  async createPlacement(
    @Param('id') folderId: string,
    @Body() createDto: CreateFolderPlacementDto,
    @CurrentUser('id') userId: string,
  ): Promise<FolderPlacementResponseDto> {
    return this.folderPlacementsService.create(userId, folderId, createDto);
  }

  /**
   * Get placements for a folder with filters
   * GET /folders/:id/placements?status=PENDING&page=1&limit=20
   */
  @Get('folders/:id/placements')
  async getFolderPlacements(
    @Param('id') folderId: string,
    @Query('status') status?: FolderPlacementStatus,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ): Promise<PaginatedPlacementsDto> {
    const filters: FolderPlacementFiltersDto = {
      folderId,
      status,
      page,
      limit,
    };
    return this.folderPlacementsService.findByFolder(folderId, filters);
  }

  /**
   * Get all folders where a channel is placed
   * GET /channels/:id/placements
   */
  @Get('channels/:id/placements')
  async getChannelPlacements(
    @Param('id') channelId: string,
  ): Promise<FolderPlacementResponseDto[]> {
    return this.folderPlacementsService.findByChannel(channelId);
  }

  /**
   * Approve a placement request (folder owner only)
   * POST /folder-placements/:id/approve
   */
  @Post('folder-placements/:id/approve')
  @HttpCode(HttpStatus.OK)
  async approvePlacement(
    @Param('id') placementId: string,
    @Body() _approveDto: ApprovePlacementDto,
    @CurrentUser('id') userId: string,
  ): Promise<FolderPlacementResponseDto> {
    return this.folderPlacementsService.approve(placementId, userId);
  }

  /**
   * Reject a placement request (folder owner only)
   * POST /folder-placements/:id/reject
   */
  @Post('folder-placements/:id/reject')
  @HttpCode(HttpStatus.OK)
  async rejectPlacement(
    @Param('id') placementId: string,
    @Body() rejectDto: RejectPlacementDto,
    @CurrentUser('id') userId: string,
  ): Promise<FolderPlacementResponseDto> {
    return this.folderPlacementsService.reject(placementId, userId, rejectDto);
  }

  /**
   * Cancel a placement request (channel owner only, PENDING only)
   * POST /folder-placements/:id/cancel
   */
  @Post('folder-placements/:id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelPlacement(
    @Param('id') placementId: string,
    @CurrentUser('id') userId: string,
  ): Promise<FolderPlacementResponseDto> {
    return this.folderPlacementsService.cancel(placementId, userId);
  }

  /**
   * Get user's placements as channel owner
   * GET /folder-placements/my/as-channel-owner?status=PENDING&page=1&limit=20
   */
  @Get('folder-placements/my/as-channel-owner')
  async getMyChannelPlacements(
    @CurrentUser('id') userId: string,
    @Query('status') status?: FolderPlacementStatus,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ): Promise<PaginatedPlacementsDto> {
    const filters: FolderPlacementFiltersDto = {
      status,
      page,
      limit,
    };
    return this.folderPlacementsService.findUserPlacements(
      userId,
      'channel',
      filters,
    );
  }

  /**
   * Get user's placements as folder owner
   * GET /folder-placements/my/as-folder-owner?status=PENDING&page=1&limit=20
   */
  @Get('folder-placements/my/as-folder-owner')
  async getMyFolderPlacements(
    @CurrentUser('id') userId: string,
    @Query('status') status?: FolderPlacementStatus,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ): Promise<PaginatedPlacementsDto> {
    const filters: FolderPlacementFiltersDto = {
      status,
      page,
      limit,
    };
    return this.folderPlacementsService.findUserPlacements(
      userId,
      'folder',
      filters,
    );
  }
}
