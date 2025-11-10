import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { InvestorDashboard } from "@shared/schema";
import { useEffect } from 'react';
import { useWebSocketMessage } from '@/lib/WebSocketContext';

export function useInvestorDashboard(walletAddress?: string | null) {
  const queryClient = useQueryClient();

  // Listen for buyout updates and earnings updates via WebSocket
  useWebSocketMessage((message) => {
    if (message.type === 'buyoutUpdate' && message.payload?.investorEarnings) {
      console.log('Received buyout update, invalidating investor dashboard');
      queryClient.invalidateQueries({ queryKey: ['/api/investors/dashboard', walletAddress] });
    }
    
    if (message.type === 'investorEarningsUpdate' && message.payload?.userId) {
      console.log('Received investor earnings update', message.payload);
      queryClient.invalidateQueries({ queryKey: ['/api/investors/dashboard', walletAddress] });
    }
  });

  return useQuery<InvestorDashboard>({
    queryKey: ["/api/investors/dashboard", walletAddress],
    enabled: !!walletAddress,
    refetchInterval: 10000, // Refresh every 10 seconds for real-time updates
    queryFn: async () => {
      if (!walletAddress) {
        return { totalEarnings: "0.00", investments: [] };
      }
      
      const response = await fetch("/api/investors/dashboard", {
        credentials: "include",
        headers: { 'x-wallet-address': walletAddress },
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          return { totalEarnings: "0.00", investments: [] };
        }
        throw new Error("Failed to fetch investor dashboard");
      }
      
      const data = await response.json();
      console.log('Investor dashboard data:', data);
      return data;
    },
  });
}