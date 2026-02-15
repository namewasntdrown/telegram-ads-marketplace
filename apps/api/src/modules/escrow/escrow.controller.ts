import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { EscrowService } from './escrow.service';
import {
  DepositRequestDto,
  DepositResponseDto,
  WithdrawalCreateDto,
  WithdrawResponseDto,
  BalanceResponseDto,
  PaginatedTransactionsDto,
} from './dto/escrow.dto';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';

@ApiTags('Escrow')
@Controller('escrow')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class EscrowController {
  constructor(private escrowService: EscrowService) {}

  @Get('balance')
  @ApiOperation({ summary: 'Get user balance' })
  async getBalance(
    @CurrentUser() user: CurrentUserData
  ): Promise<BalanceResponseDto> {
    return this.escrowService.getBalance(user.id);
  }

  @Post('deposit')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Create a deposit address' })
  async createDeposit(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: DepositRequestDto
  ): Promise<DepositResponseDto> {
    return this.escrowService.createDepositAddress(user.id, dto);
  }

  @Get('deposit/:id/status')
  @ApiOperation({ summary: 'Get deposit status' })
  async getDepositStatus(
    @CurrentUser() user: CurrentUserData,
    @Param('id') depositAddressId: string
  ) {
    return this.escrowService.getDepositStatus(user.id, depositAddressId);
  }

  @Post('withdrawal/create')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Create withdrawal (uses connected wallet address)' })
  async createWithdrawal(
    @CurrentUser() user: CurrentUserData,
    @Body() body: WithdrawalCreateDto
  ) {
    return this.escrowService.createWithdrawal(user.id, body.amount);
  }

  @Get('withdrawal/:id/status')
  @ApiOperation({ summary: 'Get withdrawal status' })
  async getWithdrawalStatus(
    @CurrentUser() user: CurrentUserData,
    @Param('id') transactionId: string
  ) {
    return this.escrowService.getWithdrawalStatus(user.id, transactionId);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Get transaction history' })
  async getTransactions(
    @CurrentUser() user: CurrentUserData,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number
  ): Promise<PaginatedTransactionsDto> {
    return this.escrowService.getTransactionHistory(user.id, page, limit);
  }
}
