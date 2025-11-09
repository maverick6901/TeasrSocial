import { facilitator } from '@coinbase/x402';
import { PublicKey, Connection, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { createWalletClient, http, parseUnits, formatUnits } from 'viem';
import { base, baseSepolia, polygon, polygonMumbai, bsc, bscTestnet, mainnet, sepolia } from 'viem/chains';
import { getNetwork, isMainnet } from '../config/networks';

export interface PaymentSplit {
  recipient: string;
  amount: string;
  description: string;
}

export interface PaymentResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  splits?: {
    platform: string;
    creator: string;
    investors?: string[];
  };
}

const PLATFORM_WALLET = '0x47aB5ba5f987A8f75f8Ef2F0D8FF33De1A04a020';
const PLATFORM_FEE_USDC = '0.05';

const SOLANA_PLATFORM_WALLET = 'YOUR_SOLANA_WALLET_ADDRESS_HERE';
const USDC_MINT_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const USDC_MINT_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

function getViemChain(network: string) {
  switch (network) {
    case 'base-mainnet': return base;
    case 'base-sepolia': return baseSepolia;
    case 'polygon-mainnet': return polygon;
    case 'polygon-mumbai': return polygonMumbai;
    case 'bsc-mainnet': return bsc;
    case 'bsc-testnet': return bscTestnet;
    case 'ethereum-mainnet': return mainnet;
    case 'ethereum-sepolia': return sepolia;
    default: return baseSepolia;
  }
}

function getSolanaConnection(network: string): Connection {
  const endpoint = network === 'solana-mainnet' 
    ? 'https://api.mainnet-beta.solana.com'
    : 'https://api.devnet.solana.com';
  return new Connection(endpoint, 'confirmed');
}

function getUsdcMint(network: string): PublicKey {
  const mint = network === 'solana-mainnet' ? USDC_MINT_MAINNET : USDC_MINT_DEVNET;
  return new PublicKey(mint);
}

export class X402PaymentService {
  /**
   * Process EVM payment with x402 protocol
   * Splits payment: platform fee -> creator -> investors
   */
  async processEvmPayment(
    totalAmount: string,
    cryptocurrency: string,
    creatorWallet: string,
    investorSplits?: PaymentSplit[]
  ): Promise<PaymentResult> {
    try {
      const network = getNetwork(cryptocurrency);
      const chain = getViemChain(network);
      
      // Parse total amount
      const total = parseFloat(totalAmount);
      const platformFee = parseFloat(PLATFORM_FEE_USDC);
      const creatorAmount = total - platformFee;
      
      console.log(`Processing EVM payment: ${total} ${cryptocurrency}`);
      console.log(`  Platform fee: ${platformFee} USDC -> ${PLATFORM_WALLET}`);
      console.log(`  Creator amount: ${creatorAmount} ${cryptocurrency} -> ${creatorWallet}`);
      
      // In production, this would use x402 to execute actual on-chain transfers
      // For now, we'll simulate the payment flow
      
      // TODO: Implement actual x402 payment execution
      // This requires:
      // 1. Creating payment requirements
      // 2. Verifying payment authorization
      // 3. Settling payment on-chain via facilitator
      // 4. Executing payment splits
      
      const mockTxHash = `0x${Math.random().toString(16).substring(2, 66)}`;
      
      return {
        success: true,
        transactionHash: mockTxHash,
        splits: {
          platform: `${platformFee} USDC`,
          creator: `${creatorAmount} ${cryptocurrency}`,
          investors: investorSplits?.map(s => `${s.amount} to ${s.recipient}`)
        }
      };
    } catch (error: any) {
      console.error('EVM payment error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Process Solana payment with x402 protocol
   * Splits payment: platform fee -> creator -> investors
   */
  async processSolanaPayment(
    totalAmount: string,
    creatorWallet: string,
    investorSplits?: PaymentSplit[]
  ): Promise<PaymentResult> {
    try {
      const network = getNetwork('SOL');
      const connection = getSolanaConnection(network);
      const usdcMint = getUsdcMint(network);
      
      // Parse amounts (USDC has 6 decimals on Solana)
      const total = parseFloat(totalAmount);
      const platformFee = parseFloat(PLATFORM_FEE_USDC);
      const creatorAmount = total - platformFee;
      
      console.log(`Processing Solana payment: ${total} USDC`);
      console.log(`  Platform fee: ${platformFee} USDC -> ${SOLANA_PLATFORM_WALLET}`);
      console.log(`  Creator amount: ${creatorAmount} USDC -> ${creatorWallet}`);
      
      // Convert to micro-units (USDC has 6 decimals)
      const platformFeeAmount = Math.floor(platformFee * 1_000_000);
      const creatorAmountMicro = Math.floor(creatorAmount * 1_000_000);
      
      // TODO: Implement actual Solana payment execution
      // This requires:
      // 1. Creating transaction with multiple transfer instructions
      // 2. Platform fee transfer (USDC SPL token)
      // 3. Creator payment transfer
      // 4. Investor distribution transfers
      // 5. Signing and sending transaction
      
      const mockTxHash = Math.random().toString(16).substring(2, 66);
      
      return {
        success: true,
        transactionHash: mockTxHash,
        splits: {
          platform: `${platformFee} USDC`,
          creator: `${creatorAmount} USDC`,
          investors: investorSplits?.map(s => `${s.amount} to ${s.recipient}`)
        }
      };
    } catch (error: any) {
      console.error('Solana payment error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Calculate investor revenue splits based on post settings
   */
  calculateInvestorSplits(
    paymentAmount: string,
    investorRevenueSharePercent: number,
    investors: Array<{ userId: string; walletAddress: string; position: number }>
  ): PaymentSplit[] {
    const payment = parseFloat(paymentAmount);
    const platformFee = parseFloat(PLATFORM_FEE_USDC);
    const afterPlatformFee = payment - platformFee;
    
    const investorShareTotal = afterPlatformFee * (investorRevenueSharePercent / 100);
    const perInvestor = investorShareTotal / investors.length;
    
    return investors.map(inv => ({
      recipient: inv.walletAddress,
      amount: perInvestor.toFixed(6),
      description: `Investor #${inv.position} revenue share`
    }));
  }

  /**
   * Process full payment with automatic splitting
   */
  async processPaymentWithSplits(params: {
    totalAmount: string;
    cryptocurrency: string;
    creatorWallet: string;
    investorRevenueSharePercent?: number;
    investors?: Array<{ userId: string; walletAddress: string; position: number }>;
  }): Promise<PaymentResult> {
    const { totalAmount, cryptocurrency, creatorWallet, investorRevenueSharePercent, investors } = params;
    
    // Calculate investor splits if applicable
    let investorSplits: PaymentSplit[] | undefined;
    if (investors && investors.length > 0 && investorRevenueSharePercent) {
      investorSplits = this.calculateInvestorSplits(
        totalAmount,
        investorRevenueSharePercent,
        investors
      );
    }
    
    // Route to appropriate blockchain
    if (cryptocurrency === 'SOL') {
      return this.processSolanaPayment(totalAmount, creatorWallet, investorSplits);
    } else {
      return this.processEvmPayment(totalAmount, cryptocurrency, creatorWallet, investorSplits);
    }
  }
}

export const x402PaymentService = new X402PaymentService();
