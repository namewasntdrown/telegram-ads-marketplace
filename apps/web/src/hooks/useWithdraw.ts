import { useState, useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useWalletStore } from '../store/wallet.store';

const POLL_INTERVAL = 5000; // 5 seconds

interface WithdrawalCreateResponse {
  transactionId: string;
  status: string;
  estimatedTime: string;
}

interface WithdrawalStatusResponse {
  status: 'pending' | 'processing' | 'sent' | 'completed' | 'failed';
  txHash?: string;
  failReason?: string;
}

/**
 * Hook for handling the withdrawal flow:
 * 1. POST /escrow/withdrawal/create → create withdrawal
 * 2. Poll status until completed or failed
 */
export function useWithdraw() {
  const queryClient = useQueryClient();
  const { setWithdrawStatus } = useWalletStore();
  const [error, setError] = useState<string | null>(null);
  const [withdrawalInfo, setWithdrawalInfo] = useState<WithdrawalCreateResponse | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current = true;
      stopPolling();
    };
  }, [stopPolling]);

  const pollStatus = useCallback(
    (transactionId: string) => {
      stopPolling();

      pollRef.current = setInterval(async () => {
        if (abortRef.current) {
          stopPolling();
          return;
        }

        try {
          const response = await api.get<WithdrawalStatusResponse>(
            `/escrow/withdrawal/${transactionId}/status`,
          );
          const { status } = response.data;

          if (status === 'completed' || status === 'sent') {
            setWithdrawStatus('completed', transactionId);
            stopPolling();
            queryClient.invalidateQueries({ queryKey: ['balance'] });
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
          } else if (status === 'failed') {
            setWithdrawStatus('failed', transactionId);
            stopPolling();
            queryClient.invalidateQueries({ queryKey: ['balance'] });
          } else if (status === 'processing') {
            setWithdrawStatus('processing', transactionId);
          }
        } catch {
          // Continue polling on network errors
        }
      }, POLL_INTERVAL);
    },
    [stopPolling, setWithdrawStatus, queryClient],
  );

  const createWithdrawal = useCallback(
    async (amountTon: string) => {
      setError(null);
      setWithdrawStatus('pending');
      abortRef.current = false;

      try {
        const response = await api.post<WithdrawalCreateResponse>(
          '/escrow/withdrawal/create',
          { amount: amountTon },
        );
        const withdrawal = response.data;
        setWithdrawalInfo(withdrawal);
        setWithdrawStatus('pending', withdrawal.transactionId);

        // Start polling
        pollStatus(withdrawal.transactionId);

        return withdrawal;
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Withdrawal failed';
        setError(message);
        setWithdrawStatus('failed');
        throw e;
      }
    },
    [setWithdrawStatus, pollStatus],
  );

  const reset = useCallback(() => {
    setError(null);
    setWithdrawalInfo(null);
    setWithdrawStatus('idle');
    stopPolling();
    abortRef.current = true;
  }, [setWithdrawStatus, stopPolling]);

  return {
    createWithdrawal,
    withdrawalInfo,
    error,
    reset,
  };
}
