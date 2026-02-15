import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { DealsService } from './deals.service';
import {
  CreateDealDto,
  DisputeDealDto,
  DealFiltersDto,
  DealResponseDto,
  PaginatedDealsDto,
} from './dto/deal.dto';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { DealAction } from './state-machine/deal-state.machine';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '@tam/shared-types';

@ApiTags('Deals')
@Controller('deals')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class DealsController {
  constructor(private dealsService: DealsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new deal request (PENDING status)' })
  async create(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateDealDto
  ): Promise<DealResponseDto> {
    return this.dealsService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get user deals' })
  async findAll(
    @CurrentUser() user: CurrentUserData,
    @Query() filters: DealFiltersDto
  ): Promise<PaginatedDealsDto> {
    return this.dealsService.findByUser(user.id, filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get deal by ID' })
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData
  ): Promise<DealResponseDto> {
    return this.dealsService.findById(id, user.id);
  }

  @Get(':id/actions')
  @ApiOperation({ summary: 'Get available actions for a deal' })
  async getActions(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData
  ): Promise<{ actions: DealAction[] }> {
    return this.dealsService.getAvailableActions(id, user.id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve deal (channel owner)',
    description: 'Approves the deal, automatically locks funds and schedules posting'
  })
  async approveDeal(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData
  ): Promise<DealResponseDto> {
    return this.dealsService.approveDeal(id, user.id);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject deal (channel owner)' })
  async rejectDeal(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
    @Body() body: { reason?: string }
  ): Promise<DealResponseDto> {
    return this.dealsService.rejectDeal(id, user.id, body.reason);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel deal (advertiser, only for PENDING deals)' })
  async cancel(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData
  ): Promise<DealResponseDto> {
    return this.dealsService.cancel(id, user.id);
  }

  @Post(':id/dispute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Open a dispute' })
  async openDispute(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: DisputeDealDto
  ): Promise<DealResponseDto> {
    return this.dealsService.openDispute(id, user.id, dto);
  }

  // ============ ADMIN ENDPOINTS ============

  @Post(':id/resolve-release')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiOperation({ summary: 'Resolve dispute - release funds to channel owner (admin only)' })
  async resolveDisputeRelease(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData
  ): Promise<DealResponseDto> {
    return this.dealsService.resolveDisputeRelease(id, user.id);
  }

  @Post(':id/resolve-refund')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiOperation({ summary: 'Resolve dispute - refund to advertiser (admin only)' })
  async resolveDisputeRefund(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData
  ): Promise<DealResponseDto> {
    return this.dealsService.resolveDisputeRefund(id, user.id);
  }
}
