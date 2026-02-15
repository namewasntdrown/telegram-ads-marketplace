import {
  Controller,
  Put,
  Delete,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { WalletService } from './wallet.service';
import {
  ConnectWalletDto,
  WalletResponseDto,
  DisconnectWalletResponseDto,
} from './dto/wallet.dto';
import {
  CurrentUser,
  CurrentUserData,
} from '../../common/decorators/current-user.decorator';

@ApiTags('Wallet')
@Controller('user/wallet')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class WalletController {
  constructor(private walletService: WalletService) {}

  @Put()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Connect wallet with TON Proof verification' })
  async connectWallet(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: ConnectWalletDto,
  ): Promise<WalletResponseDto> {
    const result = await this.walletService.connectWallet(user.id, {
      address: dto.proof.address,
      proof: dto.proof.proof,
    });

    return {
      walletAddress: result.walletAddress,
      connected: true,
    };
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disconnect wallet' })
  async disconnectWallet(
    @CurrentUser() user: CurrentUserData,
  ): Promise<DisconnectWalletResponseDto> {
    await this.walletService.disconnectWallet(user.id);
    return { disconnected: true };
  }
}
