import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsObject, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class DomainDto {
  @ApiProperty({ description: 'Domain length in bytes' })
  @IsNumber()
  lengthBytes: number;

  @ApiProperty({ description: 'Domain value (e.g. yourapp.com)' })
  @IsString()
  @IsNotEmpty()
  value: string;
}

class ProofDetailsDto {
  @ApiProperty({ description: 'Unix timestamp of proof creation' })
  @IsNumber()
  timestamp: number;

  @ApiProperty({ description: 'Domain info' })
  @IsObject()
  @ValidateNested()
  @Type(() => DomainDto)
  domain: DomainDto;

  @ApiProperty({ description: 'Base64 signature' })
  @IsString()
  @IsNotEmpty()
  signature: string;

  @ApiProperty({ description: 'Original payload sent during connect' })
  @IsString()
  @IsNotEmpty()
  payload: string;

  @ApiProperty({ description: 'Base64 stateInit of wallet' })
  @IsString()
  @IsNotEmpty()
  stateInit: string;
}

class ProofWrapperDto {
  @ApiProperty({ description: 'Wallet address' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ description: 'TON Proof details' })
  @IsObject()
  @ValidateNested()
  @Type(() => ProofDetailsDto)
  proof: ProofDetailsDto;
}

export class ConnectWalletDto {
  @ApiProperty({ description: 'TON Proof with wallet address' })
  @IsObject()
  @ValidateNested()
  @Type(() => ProofWrapperDto)
  proof: ProofWrapperDto;
}

export class WalletResponseDto {
  @ApiProperty({ description: 'Wallet address (non-bounceable)' })
  walletAddress: string;

  @ApiProperty({ description: 'Whether wallet was connected successfully' })
  connected: boolean;
}

export class DisconnectWalletResponseDto {
  @ApiProperty({ description: 'Whether wallet was disconnected' })
  disconnected: boolean;
}
