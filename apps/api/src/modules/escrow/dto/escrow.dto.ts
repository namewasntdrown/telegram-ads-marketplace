import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, Matches, IsNotEmpty } from 'class-validator';

// Regex for valid TON amount: positive number with up to 9 decimal places
const TON_AMOUNT_REGEX = /^(?!0(\.0+)?$)\d{1,12}(\.\d{1,9})?$/;
const TON_AMOUNT_MESSAGE =
  'Amount must be a positive number with up to 9 decimal places (e.g., "1.5" or "100.123456789")';

export class DepositRequestDto {
  @ApiProperty({
    description: 'Amount to deposit in TON (min 0.1, max 1000000000)',
    example: '10.5',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(TON_AMOUNT_REGEX, { message: TON_AMOUNT_MESSAGE })
  amount: string;

  @ApiPropertyOptional({ description: 'Optional deal ID to fund' })
  @IsOptional()
  @IsString()
  dealId?: string;
}

export class WithdrawalCreateDto {
  @ApiProperty({
    description: 'Amount to withdraw in TON',
    example: '10.5',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(TON_AMOUNT_REGEX, { message: TON_AMOUNT_MESSAGE })
  amount: string;
}

export class DepositResponseDto {
  @ApiProperty({ description: 'Master wallet address to send TON to' })
  address: string;

  @ApiProperty({ description: 'Memo to include in transaction' })
  memo: string;

  @ApiProperty({ description: 'Expected amount' })
  amount: string;

  @ApiProperty({ description: 'Expiry time for this deposit' })
  expiresAt: string;

  @ApiProperty({ description: 'Deposit address ID' })
  depositAddressId: string;
}

export class WithdrawRequestDto {
  @ApiProperty({
    description: 'Amount to withdraw in TON (min 0.5, max 1000000000)',
    example: '10.5',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(TON_AMOUNT_REGEX, { message: TON_AMOUNT_MESSAGE })
  amount: string;

  @ApiProperty({ description: 'TON address to send funds to' })
  @IsString()
  @Matches(/^[UEkK][Qf][a-zA-Z0-9_-]{46}$|^-?\d:[a-fA-F0-9]{64}$/, {
    message: 'Invalid TON address format',
  })
  toAddress: string;
}

export class WithdrawResponseDto {
  @ApiProperty({ description: 'Transaction ID' })
  transactionId: string;

  @ApiProperty({ description: 'Transaction status' })
  status: string;

  @ApiProperty({ description: 'Estimated processing time' })
  estimatedTime: string;
}

export class BalanceResponseDto {
  @ApiProperty({ description: 'Available balance in TON' })
  available: string;

  @ApiProperty({ description: 'Frozen balance (in escrow)' })
  frozen: string;

  @ApiProperty({ description: 'Total balance' })
  total: string;

  @ApiProperty({ description: 'Amount frozen during appeal window' })
  appealFrozen: string;

  @ApiProperty({ description: 'Withdrawable balance (available minus appeal frozen)' })
  withdrawable: string;
}

export class TransactionHistoryDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  tonTxHash?: string;

  @ApiProperty()
  amount: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  status: string;

  @ApiPropertyOptional()
  dealId?: string;

  @ApiProperty()
  createdAt: string;
}

export class PaginatedTransactionsDto {
  @ApiProperty({ type: [TransactionHistoryDto] })
  items: TransactionHistoryDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}
