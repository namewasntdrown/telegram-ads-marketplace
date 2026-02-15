import { useState, useCallback, useRef, useEffect } from 'react';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { useQueryClient } from '@tanstack/react-query';
import { beginCell } from '@ton/core';
import { api } from '../api/client';
import { useWalletStore } from '../store/wallet.store';

const DEPOSIT_WALLET_ADDRESS = import.meta.env.VITE_DEPOSIT_WALLET_ADDRESS ?? '';
const POLL_INTERVAL = 5000; // 5 seconds

interface DepositCreateResponse {
  address: string;
  memo: string;
  amount: string;
  expiresAt: string;
  depositAddressId: string;
}

interface DepositStatusResponse {
  status: 'pending' | 'confirming' | 'completed' | 'expired' | 'failed';
  txHash?: string;
  amount?: string;
}

/**
 * Hook for handling the deposit flow:
 * 1. POST /escrow/deposit → get depositId, address, memo
 * 2. Either send via TonConnect OR show address+memo for manual transfer
 * 3. Poll status until completed
 */
export function useDeposit() {
  const [tonConnectUI] = useTonConnectUI();
  const queryClient = useQueryClient();
  const { setDepositStatus } = useWalletStore();
  const [error, setError] = useState<string | null>(null);
  const [depositInfo, setDepositInfo] = useState<DepositCreateResponse | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current = true;
      stopPolling();
    };
  }, [stopPolling]);

  const pollStatus = useCallback(
    (depositAddressId: string) => {
      stopPolling();

      pollRef.current = setInterval(async () => {
        if (abortRef.current) {
          stopPolling();
          return;
        }

        try {
          const response = await api.get<DepositStatusResponse>(
            `/escrow/deposit/${depositAddressId}/status`,
          );
          const { status } = response.data;

          if (status === 'completed') {
            setDepositStatus('completed', depositAddressId);
            stopPolling();
            queryClient.invalidateQueries({ queryKey: ['balance'] });
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
          } else if (status === 'expired' || status === 'failed') {
            setDepositStatus('failed', depositAddressId);
            stopPolling();
          }
        } catch {
          // Continue polling on network errors
        }
      }, POLL_INTERVAL);
    },
    [stopPolling, setDepositStatus, queryClient],
  );

  /**
   * Step 1: Create deposit on backend → get address + memo.
   * Does NOT send the transaction yet.
   */
  const createDeposit = useCallback(
    async (amountTon: string) => {
      setError(null);
      abortRef.current = false;

      try {
        const response = await api.post<DepositCreateResponse>('/escrow/deposit', {
          amount: amountTon,
        });
        const deposit = response.data;
        // Ensure address is set (fallback to env var)
        if (!deposit.address) {
          deposit.address = DEPOSIT_WALLET_ADDRESS;
        }
        setDepositInfo(deposit);
        setDepositStatus('awaiting_tx', deposit.depositAddressId);

        // Start polling immediately — works for both TonConnect and manual transfer
        pollStatus(deposit.depositAddressId);

        return deposit;
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to create deposit';
        setError(message);
        setDepositStatus('failed');
        throw e;
      }
    },
    [setDepositStatus, pollStatus],
  );

  /**
   * Step 2 (optional): Send transaction via TonConnect.
   * Call this after createDeposit if wallet is connected.
   */
  const sendViaTonConnect = useCallback(
    async (deposit: DepositCreateResponse) => {
      try {
        const depositAddress = deposit.address || DEPOSIT_WALLET_ADDRESS;
        if (!depositAddress) {
          throw new Error('Deposit address not available');
        }

        const payloadBase64 = buildCommentPayload(deposit.memo);
        const nanoTon = toNanoString(deposit.amount);

        const tx = {
          validUntil: Math.floor(Date.now() / 1000) + 300,
          messages: [
            {
              address: depositAddress,
              amount: nanoTon,
              payload: payloadBase64,
            },
          ],
        };

        await tonConnectUI.sendTransaction(tx);
        setDepositStatus('confirming', deposit.depositAddressId);
      } catch (e) {
        // Don't set failed — user can still send manually
        const message = e instanceof Error ? e.message : 'TonConnect transaction failed';
        setError(message);
        // Keep awaiting_tx status so manual transfer UI stays visible
      }
    },
    [tonConnectUI, setDepositStatus],
  );

  const reset = useCallback(() => {
    setError(null);
    setDepositInfo(null);
    setDepositStatus('idle');
    stopPolling();
    abortRef.current = true;
  }, [setDepositStatus, stopPolling]);

  return {
    createDeposit,
    sendViaTonConnect,
    depositInfo,
    error,
    reset,
  };
}

/**
 * Convert TON amount string to nanoTON string.
 * "1.5" → "1500000000"
 */
function toNanoString(ton: string): string {
  const parts = ton.split('.');
  const whole = parts[0] || '0';
  const frac = (parts[1] || '').padEnd(9, '0').slice(0, 9);
  const nano = BigInt(whole) * BigInt(1_000_000_000) + BigInt(frac);
  return nano.toString();
}

/**
 * Build a comment payload as base64 BOC (op=0 + text) using @ton/core.
 * Produces a valid BOC with CRC32 checksum that TonConnect wallets accept.
 */
function buildCommentPayload(text: string): string {
  return beginCell()
    .storeUint(0, 32)
    .storeStringTail(text)
    .endCell()
    .toBoc()
    .toString('base64');
}
