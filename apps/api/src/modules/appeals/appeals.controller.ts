import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AppealsService } from './appeals.service';
import {
  AppealDealDto,
  AppealChannelDto,
  AppealFolderDto,
  AppealPlacementDto,
  ResolveAppealDto,
  AppealResponseDto,
} from './dto/appeal.dto';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '@tam/shared-types';

@ApiTags('Appeals')
@Controller('appeals')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class AppealsController {
  constructor(private appealsService: AppealsService) {}

  @Post('deal')
  @ApiOperation({ summary: 'Appeal a deal dispute resolution' })
  async appealDeal(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: AppealDealDto,
  ): Promise<AppealResponseDto> {
    return this.appealsService.appealDealResolution(user.id, dto);
  }

  @Post('channel')
  @ApiOperation({ summary: 'Appeal a channel rejection' })
  async appealChannel(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: AppealChannelDto,
  ): Promise<AppealResponseDto> {
    return this.appealsService.appealChannelRejection(user.id, dto);
  }

  @Post('folder')
  @ApiOperation({ summary: 'Appeal a folder rejection' })
  async appealFolder(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: AppealFolderDto,
  ): Promise<AppealResponseDto> {
    return this.appealsService.appealFolderRejection(user.id, dto);
  }

  @Post('placement')
  @ApiOperation({ summary: 'Appeal a placement rejection' })
  async appealPlacement(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: AppealPlacementDto,
  ): Promise<AppealResponseDto> {
    return this.appealsService.appealPlacementRejection(user.id, dto);
  }

  @Get('my')
  @ApiOperation({ summary: 'Get my appeals' })
  async findMyAppeals(
    @CurrentUser() user: CurrentUserData,
  ): Promise<AppealResponseDto[]> {
    return this.appealsService.findMyAppeals(user.id);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiOperation({ summary: 'Get all appeals (admin)' })
  async findAll(): Promise<AppealResponseDto[]> {
    return this.appealsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get appeal details' })
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<AppealResponseDto> {
    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.MODERATOR;
    return this.appealsService.findById(id, user.id, isAdmin);
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiOperation({ summary: 'Resolve an appeal (admin)' })
  async resolveAppeal(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: ResolveAppealDto,
  ): Promise<AppealResponseDto> {
    return this.appealsService.resolveAppeal(id, user.id, dto);
  }
}
