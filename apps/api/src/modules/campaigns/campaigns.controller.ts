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
import { CampaignsService } from './campaigns.service';
import {
  CreateCampaignDto,
  UpdateCampaignDto,
  CampaignFiltersDto,
  CampaignResponseDto,
  PaginatedCampaignsDto,
  PublicCampaignFiltersDto,
} from './dto/campaign.dto';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';

@ApiTags('Campaigns')
@Controller('campaigns')
export class CampaignsController {
  constructor(private campaignsService: CampaignsService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new campaign' })
  async create(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateCampaignDto
  ): Promise<CampaignResponseDto> {
    return this.campaignsService.create(user.id, dto);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user campaigns' })
  async findAll(
    @CurrentUser() user: CurrentUserData,
    @Query() filters: CampaignFiltersDto
  ): Promise<PaginatedCampaignsDto> {
    return this.campaignsService.findByUser(user.id, filters);
  }

  @Get('public')
  @ApiOperation({ summary: 'Browse public campaign briefs (no auth required)' })
  async findPublic(
    @Query() filters: PublicCampaignFiltersDto
  ): Promise<PaginatedCampaignsDto> {
    return this.campaignsService.findPublic(filters);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get campaign by ID' })
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData
  ): Promise<CampaignResponseDto> {
    return this.campaignsService.findById(id, user.id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update campaign' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateCampaignDto
  ): Promise<CampaignResponseDto> {
    return this.campaignsService.update(id, user.id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete campaign' })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData
  ): Promise<void> {
    return this.campaignsService.delete(id, user.id);
  }
}
