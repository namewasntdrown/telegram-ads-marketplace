import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { FoldersService } from './folders.service';
import {
  CreateFolderDto,
  UpdateFolderDto,
  FolderFiltersDto,
  FolderResponseDto,
  PaginatedFoldersDto,
  BoostFolderDto,
  UpdateFolderStatusDto,
  SetPricePerChannelDto,
} from './dto/folder.dto';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '@tam/shared-types';

@ApiTags('Folders')
@Controller('folders')
export class FoldersController {
  constructor(private foldersService: FoldersService) {}

  @Get()
  @ApiOperation({ summary: 'List all active folders with filters' })
  async findAll(@Query() filters: FolderFiltersDto): Promise<PaginatedFoldersDto> {
    return this.foldersService.findAll(filters);
  }

  // IMPORTANT: Static routes MUST come before parameterized routes
  @Get('my/folders')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user folders' })
  async findMyFolders(
    @CurrentUser() user: CurrentUserData
  ): Promise<FolderResponseDto[]> {
    return this.foldersService.findByUser(user.id);
  }

  @Get('pending')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get pending folders for moderation' })
  async findPending(): Promise<FolderResponseDto[]> {
    return this.foldersService.findPending();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get folder by ID' })
  async findById(@Param('id') id: string): Promise<FolderResponseDto> {
    return this.foldersService.findById(id);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new folder' })
  async create(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateFolderDto
  ): Promise<FolderResponseDto> {
    return this.foldersService.create(user.id, dto);
  }

  @Post(':id/boost')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Boost a folder to appear higher in listings' })
  async boost(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: BoostFolderDto
  ): Promise<FolderResponseDto> {
    return this.foldersService.boost(id, user.id, dto);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update folder' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateFolderDto
  ): Promise<FolderResponseDto> {
    return this.foldersService.update(id, user.id, dto);
  }

  @Patch(':id/status')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update folder status (moderation)' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateFolderStatusDto,
    @CurrentUser() user: CurrentUserData,
  ): Promise<FolderResponseDto> {
    return this.foldersService.updateStatus(id, dto, user.id);
  }

  @Patch(':id/price')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set price per channel placement' })
  async setPricePerChannel(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: SetPricePerChannelDto
  ): Promise<FolderResponseDto> {
    return this.foldersService.setPricePerChannel(id, user.id, dto.pricePerChannel ?? null);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete folder' })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData
  ): Promise<void> {
    return this.foldersService.delete(id, user.id);
  }

  @Post(':id/sync')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sync folder channels from Telegram' })
  async syncChannels(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData
  ) {
    return this.foldersService.syncChannels(id, user.id);
  }

  @Get(':id/synced-channels')
  @ApiOperation({ summary: 'Get synced channels for folder' })
  async getSyncedChannels(@Param('id') id: string) {
    return this.foldersService.getSyncedChannels(id);
  }
}
