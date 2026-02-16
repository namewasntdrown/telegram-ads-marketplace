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
  Res,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ChannelsService } from './channels.service';
import { MtprotoAuthService } from './mtproto-auth.service';
import { ChannelAdminsService, ChannelAdminResponseDto } from './channel-admins.service';
import {
  CreateChannelDto,
  CreateChannelByLinkDto,
  UpdateChannelDto,
  ChannelFiltersDto,
  ChannelResponseDto,
  PaginatedChannelsDto,
  BoostChannelDto,
  UpdateChannelStatusDto,
  AddChannelAdminDto,
  CheckBotAdminDto,
} from './dto/channel.dto';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '@tam/shared-types';

@ApiTags('Channels')
@Controller('channels')
export class ChannelsController {
  constructor(
    private channelsService: ChannelsService,
    private mtprotoAuthService: MtprotoAuthService,
    private channelAdminsService: ChannelAdminsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all active channels with filters' })
  async findAll(@Query() filters: ChannelFiltersDto): Promise<PaginatedChannelsDto> {
    return this.channelsService.findAll(filters);
  }

  // IMPORTANT: Static routes MUST come before parameterized routes
  // Otherwise ':id' would match 'my' and this route would be unreachable
  @Get('my/channels')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user channels' })
  async findMyChannels(
    @CurrentUser() user: CurrentUserData
  ): Promise<ChannelResponseDto[]> {
    return this.channelsService.findByUser(user.id);
  }

  @Get('pending')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get pending channels for moderation' })
  async findPending(): Promise<ChannelResponseDto[]> {
    return this.channelsService.findPending();
  }

  @Get(':id/avatar')
  @ApiOperation({
    summary: 'Get channel avatar',
    description: 'Returns the channel avatar image from storage. Returns 404 if no avatar is available.',
  })
  async getAvatar(
    @Param('id') id: string,
    @Res() res: Response
  ): Promise<void> {
    const avatarBuffer = await this.channelsService.getChannelAvatar(id);

    if (!avatarBuffer) {
      throw new NotFoundException('Avatar not found');
    }

    res.set({
      'Content-Type': 'image/jpeg',
      'Content-Length': avatarBuffer.length,
      'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
    });
    res.send(avatarBuffer);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get channel by ID' })
  async findById(@Param('id') id: string): Promise<ChannelResponseDto> {
    return this.channelsService.findById(id);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register a new channel' })
  async create(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateChannelDto
  ): Promise<ChannelResponseDto> {
    return this.channelsService.create(user.id, dto);
  }

  @Post('by-link')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register a new channel by link' })
  async createByLink(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateChannelByLinkDto
  ): Promise<ChannelResponseDto> {
    return this.channelsService.createByLink(user.id, dto);
  }

  @Post('check-bot-admin')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check if bot is admin of a channel' })
  async checkBotAdmin(
    @Body() dto: CheckBotAdminDto
  ): Promise<{ isAdmin: boolean; botUsername: string }> {
    return this.channelsService.checkBotAdmin(dto.link);
  }

  @Post(':id/boost')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Boost a channel to appear higher in listings' })
  async boost(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: BoostChannelDto
  ): Promise<ChannelResponseDto> {
    return this.channelsService.boost(id, user.id, dto);
  }

  @Post(':id/refresh-stats')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Refresh channel statistics from Telegram' })
  async refreshStats(@Param('id') id: string): Promise<ChannelResponseDto> {
    return this.channelsService.refreshChannelStats(id);
  }

  @Post(':id/verify')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Request channel verification',
    description:
      'Checks if @sha6kii is an admin of the channel. ' +
      'If verified, channel gets a checkmark and access to detailed Telegram statistics.',
  })
  async requestVerification(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData
  ): Promise<ChannelResponseDto> {
    return this.channelsService.requestVerification(id, user.id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update channel' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateChannelDto
  ): Promise<ChannelResponseDto> {
    return this.channelsService.update(id, user.id, dto);
  }

  @Patch(':id/status')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update channel status (moderation)' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateChannelStatusDto,
    @CurrentUser() user: CurrentUserData,
  ): Promise<ChannelResponseDto> {
    return this.channelsService.updateStatus(id, dto, user.id);
  }

  @Get(':id/admins')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get channel admins' })
  async getAdmins(@Param('id') id: string): Promise<ChannelAdminResponseDto[]> {
    return this.channelAdminsService.getAdmins(id);
  }

  @Post(':id/admins')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add channel admin (owner only)' })
  async addAdmin(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: AddChannelAdminDto
  ): Promise<ChannelAdminResponseDto> {
    return this.channelAdminsService.addAdmin(id, user.id, dto.username);
  }

  @Delete(':id/admins/:adminId')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove channel admin (owner only)' })
  async removeAdmin(
    @Param('id') id: string,
    @Param('adminId') adminId: string,
    @CurrentUser() user: CurrentUserData
  ): Promise<void> {
    return this.channelAdminsService.removeAdmin(id, user.id, adminId);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete channel' })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData
  ): Promise<void> {
    return this.channelsService.delete(id, user.id);
  }

  @Delete(':id/auth')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove MTProto session',
    description:
      'Disconnect MTProto session from channel, disabling verified statistics.',
  })
  async removeAuth(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData
  ): Promise<void> {
    return this.mtprotoAuthService.removeSession(id, user.id);
  }
}
