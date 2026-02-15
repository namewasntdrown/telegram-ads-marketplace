// Build: 2026-02-03-v2 - Added channel filters
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import { ThemeProvider } from './providers/ThemeProvider';
import { TonProofProvider } from './providers/TonProofProvider';
import { App } from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 2, // Data fresh for 2 minutes
      gcTime: 1000 * 60 * 10, // Keep unused data for 10 minutes
    },
  },
});

// Export for prefetching
export { queryClient };

const manifestUrl = `${window.location.origin}/tonconnect-manifest.json`;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <TonConnectUIProvider manifestUrl={manifestUrl}>
        <TonProofProvider>
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </TonProofProvider>
      </TonConnectUIProvider>
    </ThemeProvider>
  </React.StrictMode>
);
